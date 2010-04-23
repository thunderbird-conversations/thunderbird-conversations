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

var EXPORTED_SYMBOLS = ['selectRightMessage', 'groupMessages',
'convertHotmailQuotingToBlockquote1', 'convertHotmailQuotingToBlockquote2',
'convertOutlookQuotingToBlockquote', '_mm_toggleClass', '_mm_hasClass',
'convertForwardedToBlockquote', 'fusionBlockquotes']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
Components.utils.import("resource://app/modules/gloda/mimemsg.js");
/* from mailnews/base/public/nsMsgFolderFlags.idl */
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Drafts   = 0x00000400;
const nsMsgFolderFlags_Archive  = 0x00004000;

const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);

/* (no comment) */
function _mm_toggleClass(node, classname) {
  if (!node)
    return;

  let classes = [];
  if (node.hasAttribute('class'))
    classes = node.getAttribute('class').split(' ');

  if (classes.indexOf(classname) >= 0)
    classes = classes.filter(function (x) x != classname);
  else
    classes.push(classname);
  node.setAttribute('class', classes.join(' '));
}

function _mm_hasClass(node, classname) {
  let classes = [];
  if (node.hasAttribute('class'))
    classes = node.getAttribute('class').split(' ');
  for (let i = 0; i < classes.length; ++i)
    if (classes[i] == classname)
      return true;
  return false;
}

/* (sigh...) */
function insertAfter(newElement, referenceElt) {
  if (referenceElt.nextSibling)
    referenceElt.parentNode.insertBefore(newElement, referenceElt.nextSibling);
  else
    referenceElt.parentNode.appendChild(newElement);
}

/* In the case of GMail accounts, several messages with the same Message-Id
 * header will be returned when we search for all message related to the
 * conversation we will display. We have multiple alternatives to choose from,
 * so prefer :
 * - the message that's in the current folder
 * - the message that's in the "Sent" folder (GMail sent messages also appear
 *   in "All Mail")
 * - the message that's not in the Archives
 *
 * Warniiiiiiiiiiiiiiiiiiiiiiiiiiiiiing this may return null (now, cry with me).
 * But the non-null messages also have non-null folderMessage(s)
 */
function selectRightMessage(similar, currentFolder) {
  let msgHdr;
  /* NB: this won't find anything for the "Inbox" Smart Folder for instance */
  for each (let m in similar) {
    if (!m.folderMessage)
      continue;
    if (currentFolder && m.folderMessage.folder.URI == currentFolder.URI) {
      msgHdr = m;
      break;
    }
  }
  if (!msgHdr) {
    for each (let m in similar) {
      if (!m.folderMessage)
        continue;
      if (m.folderMessage.folder.getFlag(nsMsgFolderFlags_SentMail)) {
        msgHdr = m;
        break;
      }
    }
  }
  if (!msgHdr) {
    for each (let m in similar) {
      if (!m.folderMessage)
        continue;
      if (!m.folderMessage.folder.getFlag(nsMsgFolderFlags_Archive)) {
        msgHdr = m;
        break;
      }
    }
  }
  if (!msgHdr) {
    for each (let m in similar) {
      if (m.folderMessage) {
        msgHdr = m;
        break;
      }
    }
  }
  return msgHdr;
}

function _removeDuplicates(f, items) {
  let similar = {};
  let orderedIds = [];
  for (let i = 0; i < items.length; ++i) {
    let item = items[i];
    let id = f(item);
    if (!similar[id]) {
      similar[id] = [item];
      orderedIds.push(id);
    } else {
      similar[id].push(item);
    }
  }
  return [similar[id] for each ([, id] in Iterator(orderedIds))];
}

/* Group GlodaMessages by Message-Id header.
 * Returns an array [[similar items], [other similar items], ...]. */
function groupMessages(items) _removeDuplicates(function (item) item.headerMessageID, items)

/* Group nsIMsgDbHdrs by Message-Id header.
 * Returns an array [[similar items], [other similar items], ...]. */
/* function removeHdrDuplicates(items) _removeDuplicates(function (item) item.messageId, items) */

/* Create a blockquote before "marker" and insert all elements after that into
 * the blockquote. if (remove) then marker is removed. */
function makeBlockquote(aDoc, marker, remove) {
  let blockquote = aDoc.createElement("blockquote");
  blockquote.setAttribute("type", "cite");
  insertAfter(blockquote, marker);
  while (blockquote.nextSibling)
    blockquote.appendChild(blockquote.nextSibling);
  if (remove)
    marker.parentNode.removeChild(marker);
}

/* Hotmails use a <hr> to mark the start of the quoted part. */
function convertHotmailQuotingToBlockquote1(aDoc) {
  /* We make the assumption that no one uses a <hr> in their emails except for
   * separating a quoted message from the rest */
  let marker =  aDoc.getElementsByTagName("hr")[0];
  if (marker)
    makeBlockquote(aDoc, marker, true);
}

/* There's a special message header for that. */
function convertOutlookQuotingToBlockquote(aDoc) {
  /* Outlook uses a special thing for that */
  let marker = aDoc.getElementsByClassName("OutlookMessageHeader")[0];
  if (marker)
    makeBlockquote(aDoc, marker);
}

/* For #text <br /> #text ... when text nodes are quotes */
function convertHotmailQuotingToBlockquote2(aWindow, aDocument, aHideQuoteLength) {
  /* Actually that's not specific to Hotmail... */
  let brCount = 0;
  let walk = function (aNode, inBlockquote, depth) {
    let p = Object();
    let computedStyle = aNode.parentNode && aWindow.getComputedStyle(aNode.parentNode, null);
    let parentIsBlock = computedStyle && computedStyle.display == "block";
    if (aNode.nodeType == aNode.TEXT_NODE && txttohtmlconv.citeLevelTXT(aNode.textContent+" ", p) > 0 && parentIsBlock) {
      /* Strip the leading > > > ...s.
       * NB: this might actually be wrong since we might transform
       *    > blah
       *    > > duh
       * into
       *    blah
       *    duh
       * (with a single blockquote). However, Hotmail doesn't nest comments that
       * way and switches to <hr />s when there is more than one quoting level. */
      if (p.value <= aNode.textContent.length)
        aNode.textContent = aNode.textContent.substring(p.value, aNode.textContent.length);
      /* Create the <blockquote> if needed */
      if (!inBlockquote) {
        let blockquote = aDocument.createElement("blockquote");
        blockquote.setAttribute("type", "cite");
        blockquote.setUserData("hideme", false, null);
        aNode.parentNode.insertBefore(blockquote, aNode);
      }
      /* Put the text node inside the blockquote */
      let next = aNode.nextSibling;
      aNode.previousSibling.appendChild(aNode);
      /* Move on if possible */
      if (next)
        walk(next, true, depth);
    } else if (aNode.tagName && aNode.tagName.toLowerCase() == "br"
            || aNode.nodeType == aNode.TEXT_NODE && !aNode.textContent.trim().length) {
      let next = aNode.nextSibling;
      /* Inside the <blockquote> we accept <br>s and empty text nodes */
      if (inBlockquote) {
        /* Count the <br>'s */
        if (aNode.tagName && aNode.tagName.toLowerCase() == "br")
          brCount++;
        /* If we've seen enough, mark this node for folding */
        if (brCount == aHideQuoteLength + 1)
          aNode.previousSibling.setUserData("hideme", true, null);
        aNode.previousSibling.appendChild(aNode);
      }
      if (next)
        walk(next, inBlockquote, depth);
    } else {
      if (aNode.firstChild && depth < 4) /* Try to mitigate the performance hit... */
        walk(aNode.firstChild, false, depth + 1);
      if (aNode.nextSibling)
        walk(aNode.nextSibling, false, depth);
    }
  };
  walk(aDocument.body, false, 0);
}

/* Stupid regexp that matches:
 * ----- Something that supposedly says the text below is quoted -----
 * Fails 9 times out of 10. */
function convertForwardedToBlockquote(aDoc) {
  let re = /\s*(-{5,})\s+(?:\S+\s+)+\1\s*/m;
  let walk = function (aNode) {
    for each (let [, child] in Iterator(aNode.childNodes)) {
      if (child.nodeType == child.TEXT_NODE && re.test(child.textContent)) {
        makeBlockquote(aDoc, child);
        throw { found: true };
      } else {
        walk(child);
      }
    }
  };
  try {
    walk(aDoc.body);
  } catch ( { found } if found) { }
}

/* Fusion together two adjacent blockquotes */
function fusionBlockquotes(aDoc) {
  let blockquotes = aDoc.getElementsByTagName("blockquote");
  for (let i = blockquotes.length - 1; i >= 0; i--) {
    let blockquote = blockquotes[i];
    if ( blockquote
      && blockquote.nextElementSibling
      && blockquote.nextElementSibling.tagName
      && blockquote.nextElementSibling.tagName.toLowerCase() == "blockquote") {
      let b = blockquote.nextElementSibling;
      while (b.firstChild)
        blockquote.appendChild(b.firstChild);
      blockquote.parentNode.removeChild(b);
    }
  }
}
