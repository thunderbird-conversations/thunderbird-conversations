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
  // heuristics for finding quoted parts
  'convertHotmailQuotingToBlockquote1',
  'convertOutlookQuotingToBlockquote', 'convertForwardedToBlockquote',
  'fusionBlockquotes', 'convertMiscQuotingToBlockquote',
]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"]
                        .createInstance(Ci.mozITXTToHTMLConv);

/* Below are hacks^W heuristics for finding quoted parts in a given email */

/* (sigh...) */
function insertAfter(newElement, referenceElt) {
  if (referenceElt.nextSibling)
    referenceElt.parentNode.insertBefore(newElement, referenceElt.nextSibling);
  else
    referenceElt.parentNode.appendChild(newElement);
}

function canInclude(aNode) {
  let v = aNode.tagName && aNode.tagName.toLowerCase() == "br"
    || aNode.nodeType == aNode.TEXT_NODE && String.trim(aNode.textContent) === "";
  //if (v) dump("Including "+aNode+"\n");
  return v;
}

function isBody(aNode) {
  if (aNode.tagName && aNode.tagName.toLowerCase() == "body") {
    return true;
  } else {
    let count = 0;
    for each (let [, node] in Iterator(aNode.parentNode.childNodes)) {
      //dump(node+" "+node.nodeType+"\n");
      switch (node.nodeType) {
        case node.TEXT_NODE:
          if (node.textContent.trim().length > 0)
            count++;
          break;
        case node.ELEMENT_NODE:
          count++;
          break;
      }
    }
    //dump(count+"\n");
    return (count == 1) && isBody(aNode.parentNode);
  }
}

function implies(a, b) !a || a && b;

/* Create a blockquote that encloses everything relevant, starting from marker.
 * Marker is included by default, remove it later if you need to. */
function encloseInBlockquote(aDoc, marker) {
  if (marker.previousSibling && canInclude(marker.previousSibling)) {
    encloseInBlockquote(aDoc, marker.previousSibling);
  } else if (!marker.previousSibling && !isBody(marker.parentNode)) {
    encloseInBlockquote(aDoc, marker.parentNode);
  } else if (implies(marker == marker.parentNode.firstChild, !isBody(marker.parentNode))) {
    let blockquote = aDoc.createElement("blockquote");
    blockquote.setAttribute("type", "cite");
    marker.parentNode.insertBefore(blockquote, marker);
    while (blockquote.nextSibling)
      blockquote.appendChild(blockquote.nextSibling);
  }
}

function trySel(aDoc, sel, remove) {
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
  trySel(aDoc,
    "body > hr, \
     body > div > hr, \
     body > pre > hr, \
     body > div > div > hr, \
     hr#stopSpelling", true);
}

function convertMiscQuotingToBlockquote(aDoc) {
  trySel(aDoc, ".yahoo_quoted");
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
      div.style.borderTopWidth = 0;
      break;
    }
  }
}

function citeLevel (line) {
  let i;
  for (i = 0; line[i] == ">" && i < line.length; ++i)
    ; // nop
  return i;
}

/* Stupid regexp that matches:
 * ----- Something that supposedly says the text below is quoted -----
 * Fails 9 times out of 10. */
function convertForwardedToBlockquote(aDoc) {
  let re = /^\s*(-{5,15})(?:\s*)(?:[^ \f\n\r\t\v\u00A0\u2028\u2029-]+\s+)*[^ \f\n\r\t\v\u00A0\u2028\u2029-]+(\s*)\1\s*/mg;
  let walk = function (aNode) {
    for each (let [, child] in Iterator(aNode.childNodes)) {
      let txt = child.textContent;
      let m = txt.match(re);
      if (child.nodeType == child.TEXT_NODE
          && txt.indexOf("-----BEGIN PGP") < 0
          && txt.indexOf("----END PGP") < 0
          && m && m.length) {
        let marker = m[0];
        //dump("Found matching text "+marker+"\n");
        let i = txt.indexOf(marker);
        let t1 = txt.substring(0, i);
        let t2 = txt.substring(i + 1, child.textContent.length);
        let tn1 = aDoc.createTextNode(t1);
        let tn2 = aDoc.createTextNode(t2);
        child.parentNode.insertBefore(tn1, child);
        child.parentNode.insertBefore(tn2, child);
        child.parentNode.removeChild(child);
        encloseInBlockquote(aDoc, tn2);
        throw { found: true };
      } else if (m && m.length) {
        // We only move on if we found the matching text in the parent's text
        // content, otherwise, there's no chance we'll find it in the child's
        // content.
        walk(child);
      }
    }
  };
  try {
    walk(aDoc.body);
  } catch ( { found } if found) { }
}

/* If [b1] is a blockquote followed by [ns] whitespace nodes followed by [b2],
 * append [ns] to [b1], then append all the child nodes of [b2] to [b1],
 * effectively merging the two blockquotes together. */
function fusionBlockquotes(aDoc) {
  let blockquotes = new Set(aDoc.getElementsByTagName("blockquote"));
  for (let blockquote of blockquotes) {
    let isWhitespace = function (n) {
      return (n && (n.tagName && n.tagName.toLowerCase() == "br"
          || n.nodeType == n.TEXT_NODE && n.textContent.match(/^\s*$/)));
    }
    let isBlockquote = function (b) {
      return (b && b.tagName && b.tagName.toLowerCase() == "blockquote");
    };
    let blockquoteFollows = function (n) {
      return n && (isBlockquote(n) || isWhitespace(n) && blockquoteFollows(n.nextSibling));
    };
    while (blockquoteFollows(blockquote.nextSibling)) {
      while (isWhitespace(blockquote.nextSibling))
        blockquote.appendChild(blockquote.nextSibling);
      if (isBlockquote(blockquote.nextSibling)) {
        let next = blockquote.nextSibling;
        while (next.firstChild)
          blockquote.appendChild(next.firstChild);
        blockquote.parentNode.removeChild(next);
        blockquotes.delete(next);
      } else {
        Log.error("What?!");
      }
    }
  }
}
