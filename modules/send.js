var EXPORTED_SYMBOLS = ['sendMessage']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/PluralForm.jsm");

const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);
const gMsgTagService = Cc["@mozilla.org/messenger/tagservice;1"]
                       .getService(Ci.nsIMsgTagService);
const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);
const mCompType = Ci.nsIMsgCompType;

let strings = new StringBundle("chrome://conversations/locale/main.properties");

Cu.import("resource://conversations/AddressBookUtils.jsm");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/contact.js");
Cu.import("resource://conversations/hook.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Send");

// This has to be a root because once the msgCompose has deferred the treatment
//  of the send process to nsMsgSend.cpp, the nsMsgSend holds a reference to
//  nsMsgCopySendListener (nsMsgCompose.cpp). nsMsgCopySendListener holds a
//  *weak* reference to its corresponding nsIMsgCompose object, that in turns
//  forwards the notifications to our own little progressListener.
// So if no one holds a firm reference to gMsgCompose, then it might end up
//  being collected before the send process terminates, and then, it's BAD.
let gMsgCompose;

/**
 * Actually send the message based on the given parameters.
 */
function sendMessage({ msgHdr, identity, to, cc, bcc, subject },
    { deliverType, compType },
    aNode,
    { progressListener, sendListener, stateListener },
    { popOut, archive }) {

  // Here is the part where we do all the stuff related to filling proper
  //  headers, adding references, making sure all the composition fields are
  //  properly set before assembling the message.
  let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                  .createInstance(Ci.nsIMsgCompFields);
  fields.from = gHeaderParser.makeFullAddress(identity.fullName, identity.email);
  fields.to = to;
  fields.cc = cc;
  fields.bcc = bcc;
  fields.subject = subject;

  let references = [];
  switch (compType) {
    case mCompType.New:
      break;

    case mCompType.Reply:
    case mCompType.ReplyAll:
    case mCompType.ReplyToSender:
    case mCompType.ReplyToGroup:
    case mCompType.ReplyToSenderAndGroup:
    case mCompType.ReplyWithTemplate:
    case mCompType.ReplyToList:
      references = [msgHdr.getStringReference(i)
        for each (i in range(0, msgHdr.numReferences))];
      references.push(msgHdr.messageId);
      break;

    case mCompType.ForwardAsAttachment:
    case mCompType.ForwardInline:
      references.push(msgHdr.messageId);
      break;
  }
  references = ["<"+x+">" for each ([, x] in Iterator(references))];
  fields.references = references.join(" ");

  // TODO:
  // - fields.addAttachment (when attachments taken into account)

  // See suite/mailnews/compose/MsgComposeCommands.js#1783
  // We're explicitly forcing plaintext here. SendMsg is thought-out well enough
  //  and checks whether we're composing html. If we're not, it uses either the
  //  contents of the nsPlainTextEditor::OutputToString if we have an editor, or
  //  the original contents of the fields if we have no editor. That suits us
  //  well.
  // http://mxr.mozilla.org/comm-central/source/mailnews/compose/src/nsMsgCompose.cpp#1102
  // 
  // What we could do (better) is call msgCompose.InitEditor with a fake
  //  plaintext editor that implements nsIMailEditorSupport and has an
  //  OutputToString method.  We would also lift the requirement on
  //  forcePlainText, and allow multipart/alternative, which would result in the
  //  mozITXTToHTMLConv being run to convert *bold* to <b>bold</b> and so on.
  // Please note that querying the editor for its contents is the responsibility
  //  of nsMsgSend.
  // http://mxr.mozilla.org/comm-central/source/mailnews/compose/src/nsMsgSend.cpp#1615
  //
  // See also nsMsgSend:620 for a vague explanation on how the editor's HTML
  //  ends up being converted as text/plain, for the case where we would like to
  //  offer HTML editing.
  fields.useMultipartAlternative = false;
  fields.body = aNode.value+"\n"; // Doesn't work without the newline. Weird. IMAP stuff.

  // If we are to archive the conversation after sending, this means we also
  //  have to archive the sent message as well. The simple way to do it is to
  //  change the FCC (Folder CC) from the Sent folder to the Archives folder.
  if (archive) {
    // We're just assuming that the folder exists, this might not be the case...
    // But I am so NOT reimplementing the whole logic from
    //  http://mxr.mozilla.org/comm-central/source/mail/base/content/mailWindowOverlay.js#1293
    let msgDate = new Date();
    let msgYear = msgDate.getFullYear().toString();
    let monthFolderName = msgDate.toLocaleFormat("%Y-%m");
    let granularity = identity.archiveGranularity;
    let folderUri = identity.archiveFolder;
    if (granularity >= Ci.nsIMsgIdentity.perYearArchiveFolders)
      folderUri += "/" + msgYear;
    if (granularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders)
      folderUri += "/" + monthFolderName;
    if (getMail3Pane().GetMsgFolderFromUri(folderUri)) {
      Log.debug("Message will be copied in", folderUri, "once sent");
      fields.fcc = folderUri;
    } else {
      Log.warn("The archive folder doesn't exist yet, so the last message you sent won't be archived... sorry!");
    }
  }

  // We init the composition service with the right parameters, and we make sure
  //  we're announcing that we're about to compose in plaintext, so that it
  //  doesn't assume anything about having an editor (composing HTML implies
  //  having an editor instance for the compose service).
  // The variable we're interested in is m_composeHTML in nsMsgCompose.cpp – its
  //  initial value is PR_FALSE. The idea is that the msgComposeFields serve
  //  different purposes:
  //  - they initially represent the initial parameters to setup the compose
  //  window and,
  //  - once the composition is done, they represent the compose session that
  //  just finished (one notable exception is that if the editor is composing
  //  HTML, fields.body is irrelevant and the SendMsg code will query the editor
  //  for its HTML and/or plaintext contents).
  // The value is to be updated depending on the account's settings to determine
  //  whether we want HTML composition or not. This is nsMsgCompose::Initialize.
  //  Well, guess what? We're not calling that function, and we make sure
  //  m_composeHTML stays PR_FALSE until the end!
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                  .createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  params.identity = identity;
  params.type = compType;
  params.sendListener = sendListener;

  // If we want to switch to the external editor, we assembled all the
  //  composition fields properly. Pass them to a compose window, and move on.
  if (popOut) {
    // We set all the fields ourselves, force New so that the compose code
    //  doesn't try to figure out the parameters by itself.
    // XXX maybe we should just use New everywhere since we're setting the
    //  parameters ourselves anyway...
    fields.characterSet = "UTF-8";
    fields.forcePlainText = false;
    // If we don't do that the editor compose window will think that the >s that
    //  are inserted by the user are voluntary, that is, they should be escaped
    //  so that they are not parsed as quotes. We don't want that!
    // The best solution is to fire the HTML editor and replace the cited lines
    //  by the appropriate blockquotes.
    // XXX please not that we are not trying to preserve spacing, or stuff like
    //  that -- they'll die in the translation. So ASCII art quoted in the quick
    //  reply won't be preserved. We also won't preserve the format=flowed
    //  thing: if we were to do the right thing (tm) we would unparse the quoted
    //  lines and push them as single lines in the HTML, with no <br>s in the
    //  middle, but well... I guess this is okay enough.
    let citeLevel = function (line) {
      let i;
      for (i = 0; line[i] == ">" && i < line.length; ++i)
        ; // nop
      return i;
    };
    let lines = fields.body.split(/\r?\n/);
    let newLines = [];
    let level = 0;
    for each (let [, line] in Iterator(lines)) {
      let newLevel = citeLevel(line);
      if (newLevel > level)
        for (let i = level; i < newLevel; ++i)
          newLines.push('<blockquote type="cite">');
      if (newLevel < level)
        for (let i = newLevel; i < level; ++i)
          newLines.push('</blockquote>');
      let newLine = line[newLevel] == " "
        ? escapeHtml(line.substring(newLevel + 1, line.length))
        : escapeHtml(line.substring(newLevel, line.length))
      ;
      newLines.push(newLine);
      level = newLevel;
    }
    fields.body = newLines.join("\n");

    fields.bodyIsAsciiOnly = false;
    params.format = Ci.nsIMsgCompFormat.HTML;
    params.type = mCompType.New;
    msgComposeService.OpenComposeWindowWithParams(null, params);
    return true;
  } else {
    fields.forcePlainText = true;
    Log.debug(fields.body);
    // So we should have something more elaborate than a simple textarea. The
    //  reason is, we should be able to differentiate between user-inserted >'s
    //  and quote-inserted >'s. (The standard Thunderbird plaintext editor does
    //  it with a blue color). The user-inserted >'s want a space prepended so
    //  that the MUA doesn't interpret them as quotation. Real quotations don't.
    // This is kinda out of scope so we're leaving the issue non-fixed but this
    //  is clearly a FIXME.
    fields.body = simpleRewrap(fields.body, 72);
    Log.debug(fields.body);
    params.format = Ci.nsIMsgCompFormat.PlainText;

    // This part initializes a nsIMsgCompose instance. This is useless, because
    //  that component is supposed to talk to the "real" compose window, set the
    //  encoding, set the composition mode... we're only doing that because we
    //  can't send the message ourselves because of too many [noscript]s.
    if ("InitCompose" in msgComposeService) // comm-1.9.2
      gMsgCompose = msgComposeService.InitCompose (null, params);
    else // comm-central
      gMsgCompose = msgComposeService.initCompose(params);

    // We create a progress listener...
    var progress = Cc["@mozilla.org/messenger/progress;1"]
                     .createInstance(Ci.nsIMsgProgress);
    if (progress) {
      progress.registerListener(progressListener);
    }
    gMsgCompose.RegisterStateListener(stateListener);

    try {
      gMsgCompose.SendMsg (deliverType, identity, "", null, progress);
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
    return true;
  }
}
