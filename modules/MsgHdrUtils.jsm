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

var EXPORTED_SYMBOLS = ['messageBodyFromMsgHdr', 'msgHdrToNeckoURL', 'msgHdrIsDraft',
'msgHdrsMarkAsRead', 'msgHdrsArchive', 'msgHdrsDelete']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

/* from mailnews/base/public/nsMsgFolderFlags.idl */
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Drafts   = 0x00000400;
const nsMsgFolderFlags_Archive  = 0x00004000;

/**
 * Tells if the message is a draft message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 * */
function msgHdrIsDraft(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_Drafts)

/**
 * Tells if the message is a sent message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 * */
function msgHdrIsSent(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_SentMail)

/**
 * Tells if the message is an archived message
 * @param {nsIMsgDbHdr} msgHdr The message header to examine
 * @return {bool}
 * */
function msgHdrIsArchive(msgHdr) msgHdr.folder.getFlag(nsMsgFolderFlags_Archive)

/**
 * Get a string containing the body of a messsage.
 * @param {nsIMsgDbHdr} aMessageHeader The message header
 * @param {bool} aStripHtml Keep html?
 * @return {string} */
function messageBodyFromMsgHdr(aMessageHeader, aStripHtml) {  
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
  return folder.getMsgTextFromStream(listener.inputStream, aMessageHeader.Charset, 65536, 32768, false, aStripHtml, { });  
}  

/**
 * Get a nsIURI from a nsIMsgDBHdr
 * @param {nsIMsgDbHdr} aMsgHdr The message header
 * @param {nsIMessenger} gMessenger The instance of @mozilla.org/messenger;1 you
 *  have created for your script.
 * @return {nsIURI}
 * */
function msgHdrToNeckoURL(aMsgHdr, gMessenger) {
  let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  let neckoURL = {};
  let msgService = gMessenger.messageServiceFromURI(uri);
  msgService.GetUrlForUri(uri, neckoURL, null);
  return neckoURL.value;
}

/**
 * Mark an array of msgHdrs read (or unread)
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 * @param {bool} read True to mark them read, false to mark them unread
 * */
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
 * */
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
    folder.deleteMessages(msgs, null, false, false, null, true);
    folder.msgDatabase = null; /* don't leak */
  }
}

/**
 * Archive a set of messages
 * @param {nsIMsgDbHdr array} msgHdrs The message headers
 * */
function msgHdrsArchive(msgHdrs, aWindow) {
  /* See
   * http://mxr.mozilla.org/comm-central/source/suite/mailnews/mailWindowOverlay.js#1337
   *
   * The window is here because otherwise we don't have access to
   * BatchMessageMover.
   * */
  let batchMover = new aWindow.BatchMessageMover();
  /* So that this works both when my fix is there and when it is not. */
  if (batchMover.archiveMessages)
    batchMover.archiveMessages(msgHdrs);
  else
    batchMover.archiveSelectedMessages();
}
