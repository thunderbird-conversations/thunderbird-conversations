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
 * The Original Code is Mail utility functions for GMail Conversation View
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

var EXPORTED_SYMBOLS = [
  // Low-level XPCOM boring stuff
  'msgHdrToMessageBody', 'msgHdrToNeckoURL', 'msgHdrGetTags',
  // Quickly identify a message
  'msgHdrIsDraft', 'msgHdrIsSent', 'msgHdrIsArchive', 'msgHdrIsInbox',
  'msgHdrIsRss', 'msgHdrIsNntp', 'msgHdrIsJunk',
  // Actions on a set of message headers
  'msgHdrsMarkAsRead', 'msgHdrsArchive', 'msgHdrsDelete',
  // Doesn't really belong here
  'getMail3Pane',
]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

// from mailnews/base/public/nsMsgFolderFlags.idl
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Drafts   = 0x00000400;
const nsMsgFolderFlags_Archive  = 0x00004000;
const nsMsgFolderFlags_Inbox    = 0x00001000;

const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gMsgTagService = Cc["@mozilla.org/messenger/tagservice;1"]
                       .getService(Ci.nsIMsgTagService);

/**
 * Tells if the message is in the account's inbox
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsInbox(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_Inbox)

/**
 * Tells if the message is a draft message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsDraft(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_Drafts)

/**
 * Tells if the message is a sent message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsSent(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_SentMail)

/**
 * Tells if the message is an archived message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 */
function msgHdrIsArchive(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_Archive)

/**
 * Get a string containing the body of a messsage.
 * @param {nsIMsgDbHdr} aMessageHeader The message header
 * @param {bool} aStripHtml Keep html?
 * @return {string}
 */
function msgHdrToMessageBody(aMessageHeader, aStripHtml, aLength) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);  
  let listener = Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance(Ci.nsISyncStreamListener);  
  let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);  
  messenger.messageServiceFromURI(uri).streamMessage(uri, listener, null, null, false, "");  
  let folder = aMessageHeader.folder;  
  /*
   * AUTF8String getMsgTextFromStream(in nsIInputStream aStream, in ACString aCharset,
                                      in unsigned long aBytesToRead, in unsigned long aMaxOutputLen, 
                                      in boolean aCompressQuotes, in boolean aStripHTMLTags,
                                      out ACString aContentType);
  */
  return folder.getMsgTextFromStream(
    listener.inputStream, aMessageHeader.Charset, 2*aLength, aLength, false, aStripHtml, { });  
}  

/**
 * Get a nsIURI from a nsIMsgDBHdr
 * @param {nsIMsgDbHdr} aMsgHdr The message header
 * @return {nsIURI}
 */
function msgHdrToNeckoURL(aMsgHdr) {
  let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  let neckoURL = {};
  let msgService = gMessenger.messageServiceFromURI(uri);
  msgService.GetUrlForUri(uri, neckoURL, null);
  return neckoURL.value;
}

/**
 * Given a msgHdr, return a list of tag objects. This function
 * just does the messy work of understanding how tags are
 * stored in nsIMsgDBHdrs.  It would be a good candidate for
 * a utility library.
 *
 * @param aMsgHdr: the msgHdr whose tags we want
 * @return a list of tag objects.
 */
function msgHdrGetTags (aMsgHdr) {
  let keywords = aMsgHdr.getStringProperty("keywords");
  let keywordList = keywords.split(' ');
  let keywordMap = {};
  for (let iKeyword = 0; iKeyword < keywordList.length; iKeyword++) {
    let keyword = keywordList[iKeyword];
    keywordMap[keyword] = true;
  }

  let tagArray = gMsgTagService.getAllTags({});
  let tags = [];
  for (let iTag = 0; iTag < tagArray.length; iTag++) {
    let tag = tagArray[iTag];
    if (tag.key in keywordMap)
      tags.push(tag);
  }
  return tags;
}

/**
 * Mark an array of msgHdrs read (or unread)
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 * @param {bool} read True to mark them read, false to mark them unread
 */
function msgHdrsMarkAsRead(msgHdrs, read) {
  let pending = {};
  for each (msgHdr in msgHdrs) {
    if (msgHdr.isRead == read)
      continue;
    if (!pending[msgHdr.folder.URI]) {
      pending[msgHdr.folder.URI] = {
        folder: msgHdr.folder,
        msgs: Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray)
      };
    }
    pending[msgHdr.folder.URI].msgs.appendElement(msgHdr, false);
  }
  for each (let { folder, msgs } in pending) {
    folder.markMessagesRead(msgs, read);
    folder.msgDatabase = null; /* don't leak */
  }
}

/**
 * Delete a set of messages.
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 */
function msgHdrsDelete(msgHdrs) {
  let pending = {};
  for each (msgHdr in msgHdrs) {
    if (!pending[msgHdr.folder.URI]) {
      pending[msgHdr.folder.URI] = {
        folder: msgHdr.folder,
        msgs: Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray)
      };
    }
    pending[msgHdr.folder.URI].msgs.appendElement(msgHdr, false);
  }
  for each (let { folder, msgs } in pending) {
    folder.deleteMessages(msgs, getMail3Pane().msgWindow, false, false, null, true);
    folder.msgDatabase = null; /* don't leak */
  }
}

let w = null;
function getMail3Pane(aForce) {
  if (!w || aForce)
    w = Cc["@mozilla.org/appshell/window-mediator;1"]
          .getService(Ci.nsIWindowMediator)
          .getMostRecentWindow("mail:3pane");
  return w;
}

/**
 * Archive a set of messages
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 */
function msgHdrsArchive(msgHdrs) {
  /* See
   * http://mxr.mozilla.org/comm-central/source/suite/mailnews/mailWindowOverlay.js#1337
   *
   * The window is here because otherwise we don't have access to
   * BatchMessageMover.
   * */
  let mail3PaneWindow = getMail3Pane();
  let batchMover = new mail3PaneWindow.BatchMessageMover();
  batchMover.archiveMessages(msgHdrs);
}

/**
 * Tell if a message is an RSS feed iteme
 * @param {nsIMsgDbHdr} msgHdr The message header
 */
function msgHdrIsRss(msgHdr) (
  msgHdr.folder.server instanceof Ci.nsIRssIncomingServer
)

/**
 * Tell if a message is a NNTP message
 * @param {nsIMsgDbHdr} msgHdr The message header
 */
function msgHdrIsNntp(msgHdr) (
  msgHdr.folder.server instanceof Ci.nsINntpIncomingServer
)

/**
 * Tell if a message has been marked as junk.
 * @param {nsIMsgDbHdr} msgHdr The message header
 */
function msgHdrIsJunk(aMsgHdr) {
  return aMsgHdr.getStringProperty("junkscore") == Ci.nsIJunkMailPlugin.IS_SPAM_SCORE;
}

// XXX implement some day
function msgHdrMarkAsJunk(msgHdr) {
  //starts here http://mxr.mozilla.org/comm-central/source/mailnews/base/content/junkCommands.js#384
  /* 2733   nsCOMPtr<nsIJunkMailPlugin> junkPlugin;
  2734 
  2735   // if this is a junk command, get the junk plugin.
  2736   if (command == nsMsgViewCommandType::junk ||
  2737       command == nsMsgViewCommandType::unjunk)
  2738   {
  2739     // get the folder from the first item; we assume that
  2740     // all messages in the view are from the same folder (no
  2741     // more junk status column in the 'search messages' dialog
  2742     // like in earlier versions...)
  2743 
  2744      nsCOMPtr<nsIMsgIncomingServer> server;
  2745      rv = folder->GetServer(getter_AddRefs(server));
  2746      NS_ENSURE_SUCCESS(rv, rv);
  2747 
  2748     nsCOMPtr<nsIMsgFilterPlugin> filterPlugin;
  2749     rv = server->GetSpamFilterPlugin(getter_AddRefs(filterPlugin));
  2750     NS_ENSURE_SUCCESS(rv, rv);
  2751 
  2752     junkPlugin = do_QueryInterface(filterPlugin, &rv);
  2753     NS_ENSURE_SUCCESS(rv, rv);
  2754     if (!mJunkHdrs)
  2755     {
  2756       mJunkHdrs = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
  2757       NS_ENSURE_SUCCESS(rv,rv);
  2758     }
  2759   }


    2817       case nsMsgViewCommandType::junk:
  2818         mNumMessagesRemainingInBatch++;
  2819         mJunkHdrs->AppendElement(msgHdr, PR_FALSE);
  2820         rv = SetMsgHdrJunkStatus(junkPlugin.get(), msgHdr,
  2821                                  nsIJunkMailPlugin::JUNK);
  2822         break;

    2837     // Provide junk-related batch notifications
  2838     if ((command == nsMsgViewCommandType::junk) &&
  2839         (command == nsMsgViewCommandType::unjunk)) {
  2840       nsCOMPtr<nsIMsgFolderNotificationService>
  2841         notifier(do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID));
  2842       if (notifier)
  2843         notifier->NotifyItemEvent(messages,
  2844                                   NS_LITERAL_CSTRING("JunkStatusChanged"),
  2845                                   (command == nsMsgViewCommandType::junk) ?
  2846                                     kJunkMsgAtom : kNotJunkMsgAtom);
  2847     } */

  //check OnMessageClassified for the rest of the actions
  //http://mxr.mozilla.org/comm-central/source/mailnews/base/content/junkCommands.js#241
  //the listener is for automatic classification, for manual marking, the
  //junkstatusorigin needs to be changed
}
