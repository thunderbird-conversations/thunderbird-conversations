var EXPORTED_SYMBOLS = ['getMessageBody', 'selectRightMessage',
  'removeDuplicates']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
/* from mailnews/base/public/nsMsgFolderFlags.idl */
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Archive  = 0x00004000;

/* Do a "old-style" retrieval of a message's body given its nsIMsgDBHdr. This
 * is useful when MsgHdrToMimeMessage fails. */
function getMessageBody(aMessageHeader, aStripHtml) {  
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

/* In the case of GMail accounts, several messages with the same Message-Id
 * header will be returned when we search for all message related to the
 * conversation we will display. We have multiple alternatives to choose from,
 * so prefer :
 * - the message that's in the current folder
 * - the message that's in the "Sent" folder (GMail sent messages also appear
 *   in "All Mail")
 * - the message that's not in the Archives
 */
function selectRightMessage(similar, currentFolder) {
  let msgHdr;
  /* NB: this won't find anything for the "Inbox" Smart Folder for instance */
  for each (let m in similar) {
    if (currentFolder && m.folderMessage.folder.URI == currentFolder.URI) {
      dump("Found a corresponding message in the current folder\n");
      msgHdr = m;
      break;
    }
  }
  if (!msgHdr) {
    for each (let m in similar) {
      if (m.folderMessage.folder.getFlag(nsMsgFolderFlags_SentMail)) {
        dump("Found a corresponding message in the sent folder\n");
        msgHdr = m;
        break;
      }
    }
  }
  if (!msgHdr) {
    for each (let m in similar) {
      if (!m.folderMessage.folder.getFlag(nsMsgFolderFlags_Archive)) {
        dump("Found a corresponding message that's not in an Archive folder\n");
        msgHdr = m;
        break;
      }
    }
  }
  if (!msgHdr)
    msgHdr = similar[0];
  return msgHdr;
}

/* Remove messages with the same Message-Id header from a collection.
 * Return an object with, for each message in selectedMessages, the duplicates
 * that have been found. */
function removeDuplicates(items) {
  //let info = function (hdr) hdr.mime2DecodedAuthor+" ["+hdr.mime2DecodedSubject+"]";
  let similar = {};
  let orderedIds = [];
  for (let i = 0; i < items.length; ++i) {
    let item = items[i];
    let id = item.headerMessageID;
    if (!similar[id]) {
      similar[id] = [item];
      orderedIds.push(id);
    } else {
      similar[id].push(item);
    }
  }
  return [similar[id] for each (id in orderedIds)];
}
