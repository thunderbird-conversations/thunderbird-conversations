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

var EXPORTED_SYMBOLS = ['dateAsInMessageList', 'selectRightMessage',
'groupMessages', 'convertHotmailQuotingToBlockquote1',
'convertHotmailQuotingToBlockquote2', 'convertOutlookQuotingToBlockquote',
'convertForwardedToBlockquote', 'fusionBlockquotes', 'parseShortName']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
Cu.import("resource://app/modules/gloda/mimemsg.js");

/* from mailnews/base/public/nsMsgFolderFlags.idl */
const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Drafts   = 0x00000400;
const nsMsgFolderFlags_Archive  = 0x00004000;

const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);
const i18nDateFormatter = Cc["@mozilla.org/intl/scriptabledateformat;1"].createInstance(Ci.nsIScriptableDateFormat);

function dateAsInMessageList(dateObject) {
  let format = dateObject.toLocaleDateString("%x") == (new Date()).toLocaleDateString("%x")
    ? Ci.nsIScriptableDateFormat.dateFormatNone
    : Ci.nsIScriptableDateFormat.dateFormatShort;
  return i18nDateFormatter.FormatDateTime("",
                                          format,
                                          Ci.nsIScriptableDateFormat.timeFormatNoSeconds,
                                          dateObject.getFullYear(),
                                          dateObject.getMonth() + 1,
                                          dateObject.getDate(),
                                          dateObject.getHours(),
                                          dateObject.getMinutes(),
                                          dateObject.getSeconds());
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
 * But if it returns a non-null MimeMsg, then this MimeMsg's folderMessage is
 * also non-null.
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

function canInclude(aNode) {
  let v = aNode.tagName && aNode.tagName.toLowerCase() == "br"
    || aNode.nodeType == aNode.TEXT_NODE && String.trim(aNode.textContent) === "";
  if (v) dump("Including "+aNode+"\n");
  return v;
}

function isBody(aNode) {
  return aNode.parentNode.parentNode.nodeType == aNode.NODE_DOCUMENT;
}

/* Create a blockquote that encloses everything relevant, starting from marker.
 * Marker is included by default, remove it later if you need to. */
function encloseInBlockquote(aDoc, marker) {
  if (marker.previousSibling && canInclude(marker.previousSibling)) {
    encloseInBlockquote(aDoc, marker.previousSibling);
  } else if (!marker.previousSibling && !isBody(marker.parentNode)) {
    encloseInBlockquote(aDoc, marker.parentNode);
  } else {
    let blockquote = aDoc.createElement("blockquote");
    blockquote.setAttribute("type", "cite");
    marker.parentNode.insertBefore(blockquote, marker);
    while (blockquote.nextSibling)
      blockquote.appendChild(blockquote.nextSibling);
  }
}

function trySel (aDoc, sel, remove) {
  let marker = aDoc.querySelector(sel);
  if (marker) {
    encloseInBlockquote(aDoc, marker);
    if (remove)
      marker.parentNode.removeChild(marker);
  }
  return marker != null;
}

/* Hotmails use a <hr> to mark the start of the quoted part. */
function convertHotmailQuotingToBlockquote1(aDoc) {
  /* We make the assumption that no one uses a <hr> in their emails except for
   * separating a quoted message from the rest */
  trySel(aDoc, "hr#stopSpelling", true);
}

/* There's a special message header for that. */
function convertOutlookQuotingToBlockquote(aWin, aDoc) {
  /* Outlook uses a special thing for that */
  trySel(aDoc, ".OutlookMessageHeader");
  for each (let [, div] in Iterator(aDoc.getElementsByTagName("div"))) {
    let style = aWin.getComputedStyle(div, null);
    if (style.borderTopColor == "rgb(181, 196, 223)"
        && style.borderTopStyle == "solid"
        && style.borderLeftWidth == "0px"
        && style.borderRightWidth == "0px"
        && style.borderBottomWidth == "0px") {
      encloseInBlockquote(aDoc, div);
      div.parentNode.removeChild(div);
      break;
    }
  }
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
  let re = /^\s*(-{5,15})(?:\s*)(?:[^ \f\n\r\t\v\u00A0\u2028\u2029-]+\s+)*[^ \f\n\r\t\v\u00A0\u2028\u2029-]+(\s*)\1\s*/mg;
  let walk = function (aNode) {
    for each (let [, child] in Iterator(aNode.childNodes)) {
      let m = child.textContent.match(re);
      if (child.nodeType == child.TEXT_NODE
          && child.textContent.indexOf("-----BEGIN PGP") < 0
          && child.textContent.indexOf("----END PGP") < 0
          && m && m.length) {
        let marker = m[0];
        dump("Found matching text "+marker+"\n");
        let i = child.textContent.indexOf(marker);
        let t1 = child.textContent.substring(0, i);
        let t2 = child.textContent.substring(i + 1, child.textContent.length);
        let tn1 = aDoc.createTextNode(t1);
        let tn2 = aDoc.createTextNode(t2);
        child.parentNode.insertBefore(tn1, child);
        child.parentNode.insertBefore(tn2, child);
        child.parentNode.removeChild(child);
        encloseInBlockquote(aDoc, tn2);
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

/* Get a short name out of an email address or a name, suitable for condensed
 * display */
function _parseShortName(str) {
  if (str.indexOf("@") >= 0) { //firstname.lastname
    var j = str.lastIndexOf("@");
    var before = str.substring(0, str.lastIndexOf("@"));
    if (before.indexOf(".") >= 0) {
      var i = before.lastIndexOf(".");
      var fst = before.substring(0, i);
      var last = before.substring(i + 1, before.length);
      if (fst.length > 1)
        return fst;
      else
        return before;
    } else {
      return before;
    }
  } else {
    var words = str.split(" ");
    var found = false;
    for (var i = 0; i < words.length; i++) {
      if (words[0].toUpperCase() === words[0]) {
        words.shift();
        found = true;
      }
      else {
        break;
      }
    }
    if (words.length > 0 && found) { // PROTZENKO Jonathan
      return words.join(" ");
    } else {
      var words = str.split(" ");
      var found = false;
      for (var i = words.length - 1; i >= 0; i--) {
        if (words[words.length - 1].toUpperCase() === words[words.length - 1]) {
          words.pop();
          found = true;
        }
        else {
          break;
        }
      }
      if (words.length > 0 && found) { // Jonathan PROTZENKO
        return words.join(" ");
      } else { // Split on last space
        var j = str.lastIndexOf(" ");
        if (j >= 0 && words.length == 2) // we're conservative here
          return str.substring(0, j);
        else
          return str;
      }
    }
  }
}

function parseShortName(str) {
  var r = _parseShortName(str);
  if (r.length > 40) // please...
    return r.substring(0, 40)+"…";
  else
    return r;
}
