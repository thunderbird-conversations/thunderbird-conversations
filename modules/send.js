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

/**
 * Actually send the message based on the given parameters.
 */
function sendMessage({ msgHdr, identity, to, cc, bcc, subject },
    { deliverType, compType },
    aNode,
    { progressListener, sendListener, stateListener },
    aPopOut) {

  // Here is the part where we do all the stuff related to filling proper
  //  headers, adding references, making sure all the composition fields are
  //  properly set before assembling the message.
  let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                  .createInstance(Ci.nsIMsgCompFields);
  fields.from = identity.fullName + " <" + identity.email + ">";
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
  fields.body = escapeHtml(fields.body);
  fields.body = fields.body.replace(/\r?\n/g, "<br>");

  // We init the composition service with the right parameters, and we make sure
  //  we're announcing that we're about to compose in plaintext, so that it
  //  doesn't assume anything about having an editor (composing HTML implies
  //  having an editor instance for the compose service).
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                  .createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  params.identity = identity;
  params.type = compType;
  params.sendListener = sendListener;

  // If we want to switch to the external editor, we assembled all the
  //  composition fields properly. Pass them to a compose window, and move on.
  if (aPopOut) {
    // We set all the fields ourselves, force New so that the compose code
    //  doesn't try to figure out the parameters by itself.
    // XXX maybe we should just use New everywhere since we're setting the
    //  parameters ourselves anyway...
    fields.forcePlainText = false;
    fields.characterSet = "UTF-8";
    fields.bodyIsAsciiOnly = false;
    params.format = Ci.nsIMsgCompFormat.HTML;
    params.type = mCompType.New;
    msgComposeService.OpenComposeWindowWithParams(null, params);
    return true;
  } else {
    fields.forcePlainText = true;
    fields.ConvertBodyToPlainText(); // This takes care of wrapping at 70 characters. Expects HTML.
    params.format = Ci.nsIMsgCompFormat.PlainText;

    // This part initializes a nsIMsgCompose instance. This is useless, because
    //  that component is supposed to talk to the "real" compose window, set the
    //  encoding, set the composition mode... we're only doing that because we
    //  can't send the message ourselves because of too many [noscript]s.
    let msgCompose;
    if ("InitCompose" in msgComposeService) // comm-1.9.2
      msgCompose = msgComposeService.InitCompose (null, params);
    else // comm-central
      msgCompose = msgComposeService.initCompose(params);

    // We create a progress listener...
    var progress = Cc["@mozilla.org/messenger/progress;1"]
                     .createInstance(Ci.nsIMsgProgress);
    if (progress) {
      progress.registerListener(progressListener);
    }
    msgCompose.RegisterStateListener(stateListener);

    try {
      msgCompose.SendMsg (deliverType, identity, "", null, progress);
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
    return true;
  }
}
