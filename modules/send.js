/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 * Jonathan Protzenko
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ['sendMessage']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/PluralForm.jsm");
Cu.import("resource:///modules/MailUtils.js"); // for getFolderForURI

const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);
const mCompType = Ci.nsIMsgCompType;

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/compose.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Send");

/**
 * Get the Archive folder URI depending on the given identity and the given Date
 *  object.
 * @param {nsIMsgIdentity} identity
 * @param {Date} msgDate
 * @return {String} The URI for the folder. Use MailUtils.getFolderForURI.
 */
function getArchiveFolderUriFor(identity, msgDate) {
  let msgYear = msgDate.getFullYear().toString();
  let monthFolderName = msgDate.toLocaleFormat("%Y-%m");
  let granularity = identity.archiveGranularity;
  let folderUri = identity.archiveFolder;
  if (granularity >= Ci.nsIMsgIdentity.perYearArchiveFolders)
    folderUri += "/" + msgYear;
  if (granularity >= Ci.nsIMsgIdentity.perMonthArchiveFolders)
    folderUri += "/" + monthFolderName;
  return folderUri;
}

// This has to be a root because once the msgCompose has deferred the treatment
//  of the send process to nsMsgSend.cpp, the nsMsgSend holds a reference to
//  nsMsgCopySendListener (nsMsgCompose.cpp). nsMsgCopySendListener holds a
//  *weak* reference to its corresponding nsIMsgCompose object, that in turns
//  forwards the notifications to our own little progressListener.
// So if no one holds a firm reference to gMsgCompose, then it might end up
//  being collected before the send process terminates, and then, it's BAD.
// The bad case would be:
//  * user hits "send"
//  * quickly changes conversations
//  * writes a new email
//  * the previous send hasn't completed, but the user hits send anyway
//  * gMsgCompose is overridden
//  * a garbage collection kicks in, collects the previous StateListener
//  * first send completes
//  * the first listener fails to receive the notification.
// That's way too implausible, so I'll just assume this doesn't happen!
let gMsgCompose;

/**
 * This is our monstrous Javascript function for sending a message. It hides all
 *  the atrocities of nsMsgCompose.cpp and nsMsgSend.cpp for you, and it
 *  provides what I hope is a much more understandable interface.
 * You are expected to provide the whole set of listeners. The most interesting
 *  one is the stateListener, since it has the ComposeProcessDone notification.
 * This version only does plaintext composition but I hope to enhance it with
 *  both HTML and plaintext in the future.
 * @param composeParameters
 * @param composeParameters.identity The identity the user picked to send the
 *  message
 * @param composeParameters.to The recipients. This is a comma-separated list of
 *  valid email addresses that must be escaped already. You probably want to use
 *  nsIMsgHeaderParser.MakeFullAddress to deal with names that contain commas.
 * @param composeParameters.cc Same remark.
 * @param composeParameters.bcc Same remark.
 * @param composeParameters.subject The subject, no restrictions on that one.
 *
 * @param sendingParameters
 * @param sendingParameters.deliverType See Ci.nsIMsgCompDeliverMode
 * @param sendingParameters.compType See Ci.nsIMsgCompType. We use this to
 *  determine what kind of headers we should set (Reply-To, References...).
 *
 * @param aNode The DOM node that holds the editing session. Right now, it's
 *  kinda useless if it's only plaintext, but it's relevant for the HTML
 *  composition (because nsMsgSend queries the original DOM node to find out
 *  about inline images).
 *
 * @param listeners
 * @param listeners.progressListener That one monitors the progress of long
 *  operations (like sending a message with attachments), it's notified with the
 *  current percentage of completion.
 * @param listeners.sendListener That one receives notifications about factual
 *  events (sending, copying to Sent, ...). It receives notifications with
 *  statuses.
 * @param listeners.stateListener This one is a high-level listener that
 *   receives notifications about the global composition process.
 *
 * @param options
 * @param options.popOut Don't send the message, just transfer it to a new
 *  composition window.
 * @param options.archive Shall we archive the message right away? This won't
 *  even copy it to the Sent folder. Warning: this one assumes that the "right"
 *  Archives folder already exists.
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
  // We're in 2011 now, let's assume everyone knows how to read UTF-8
  fields.bodyIsAsciiOnly = false;
  fields.characterSet = "UTF-8";
  fields.body = aNode.value+"\n"; // Doesn't work without the newline. Weird. IMAP stuff.

  // If we are to archive the conversation after sending, this means we also
  //  have to archive the sent message as well. The simple way to do it is to
  //  change the FCC (Folder CC) from the Sent folder to the Archives folder.
  if (archive) {
    // We're just assuming that the folder exists, this might not be the case...
    // But I am so NOT reimplementing the whole logic from
    //  http://mxr.mozilla.org/comm-central/source/mail/base/content/mailWindowOverlay.js#1293
    let folderUri = getArchiveFolderUriFor(identity, new Date());
    if (MailUtils.getFolderForURI(folderUri, true)) {
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
    // XXX please note that we are not trying to preserve spacing, or stuff like
    //  that -- they'll die in the translation. So ASCII art quoted in the quick
    //  reply won't be preserved. We also won't preserve the format=flowed
    //  thing: if we were to do the right thing (tm) we would unparse the quoted
    //  lines and push them as single lines in the HTML, with no <br>s in the
    //  middle, but well... I guess this is okay enough.
    fields.body = plainTextToHtml(fields.body);

    params.format = Ci.nsIMsgCompFormat.HTML;
    params.type = mCompType.New;
    msgComposeService.OpenComposeWindowWithParams(null, params);
    return true;
  } else {
    fields.forcePlainText = true;
    // So we should have something more elaborate than a simple textarea. The
    //  reason is, we should be able to differentiate between user-inserted >'s
    //  and quote-inserted >'s. (The standard Thunderbird plaintext editor does
    //  it with a blue color). The user-inserted >'s want a space prepended so
    //  that the MUA doesn't interpret them as quotation. Real quotations don't.
    // This is kinda out of scope so we're leaving the issue non-fixed but this
    //  is clearly a FIXME.
    fields.body = simpleWrap(fields.body, 72);
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
      gMsgCompose.SendMsg(deliverType, identity, "", null, progress);
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
    return true;
  }
}
