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
  'groupArray', 'joinWordList', 'iconForMimeType',
  'EventHelperMixIn', 'arrayEquals', 'LINKS_REGEX',
  'linkifySubject', 'topMail3Pane', 'reindexMessages',
  'folderName', 'openConversationInTabOrWindow'
]

var LINKS_REGEX = /((\w+):\/\/[^<>()'"\s]+|www(\.[-\w]+){2,})/;

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/gloda/index_msg.js");
Cu.import("resource://conversations/modules/stdlib/misc.js");
Cu.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/modules/prefs.js");
Cu.import("resource://conversations/modules/log.js");

let Log = setupLogging("Conversations.Misc");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

function arrayEquals(a1, a2) {
  if (a1.length != a2.length)
    return;

  return a1.every(function(v, i) {
    return v == a2[i];
  });
}

/**
 * Group some array elements according to a key function
 * @param aItems The array elements (or anything Iterable)
 * @param aFn The function that take an element from the array and returns an id
 * @return an array of arrays, with each inner array containing all elements
 *  sharing the same key
 */
function groupArray(aItems, aFn) {
  let groups = {};
  let orderedIds = [];
  for (let item of aItems) {
    let id = aFn(item);
    if (!groups[id]) {
      groups[id] = [item];
      orderedIds.push(id);
    } else {
      groups[id].push(item);
    }
  }
  return orderedIds.map(id => groups[id]);
}

// Joins together names and format them as "John, Jane and Julie"
function joinWordList (aElements, aInsertHtml) {
  let wrap = aInsertHtml
    ? x => "<span>" + x + "</span>"
    : x => x
  ;
  let l = aElements.length;
  if (l == 0)
    return "";
  else if (l == 1)
    return aElements[0];
  else {
    let hd = aElements.slice(0, l - 1);
    let tl = aElements[l-1];
    return hd.join(wrap(strings.get("sepComma"))) + wrap(strings.get("sepAnd")) + tl;
  }
}

let mapping = [
  ["application/msword", "x-office-document"],
  ["application/vnd.ms-excel", "x-office-spreadsheet"],
  ["application/vnd.ms-powerpoint", "x-office-presentation"],
  ["application/rtf", "x-office-document"],
  ["application/zip", "package-x-generic"],
  ["application/bzip2", "package-x-generic"],
  ["application/x-gzip", "package-x-generic"],
  ["application/x-tar", "package-x-generic"],
  ["application/x-compressed", "package-x-generic"],
  //"message/": "email",
  ["text/x-vcalendar", "x-office-calendar"],
  ["text/x-vcard", "x-office-address-book"],
  ["text/html", "text-html"],
  ["application/pdf", "application-pdf"],
  ["application/x-pdf", "application-pdf"],
  ["application/x-bzpdf", "application-pdf"],
  ["application/x-gzpdf", "application-pdf"],
];

let fallbackMapping = [
  // Fallbacks, at the end.
  ["video/", "video-x-generic"],
  ["audio/", "audio-x-generic"],
  ["image/", "image-x-generic"],
  ["text/", "text-x-generic"],
];

function iconForMimeType (aMimeType) {
  let idx = mapping.findIndex(function([k, ]) {
    return aMimeType == k;
  });
  if (idx != -1) {
    return mapping[idx][1] + ".svg";
  }
  idx = fallbackMapping.findIndex(function([k, ]) {
    return aMimeType.startsWith(k);
  });
  if (idx != -1) {
    return fallbackMapping[idx][1] + ".svg";
  }
  return "gtk-file.png";
}

/**
 * Used to enrich the Message and Contact objects. Assumes the object it's added
 *  upon has a _domNode property. Also assumes it has a _msgHdr and _uri
 *  property if compose is to be called.
 */
let EventHelperMixIn = {

  compose: function _EventHelper_compose (aCompType, aEvent) {
    let window = topMail3Pane(this);
    if (aEvent && aEvent.shiftKey) {
      window.ComposeMessage(aCompType, Ci.nsIMsgCompFormat.OppositeOfDefault, this._msgHdr.folder, [this._uri]);
    } else {
      window.ComposeMessage(aCompType, Ci.nsIMsgCompFormat.Default, this._msgHdr.folder, [this._uri]);
    }
  },

  forward: function _EventHelper_forward (event) {
    let forwardType = 0;
    try {
      forwardType = Prefs.getInt("mail.forward_message_mode");
    } catch (e) {
      Log.error("Unable to fetch preferred forward mode\n");
    }
    if (forwardType == 0)
      this.compose(Ci.nsIMsgCompType.ForwardAsAttachment, event);
    else
      this.compose(Ci.nsIMsgCompType.ForwardInline, event);
  },

  register: function _EventHelper_register (selector, f, options) {
    let action;
    if (typeof(options) == "undefined" || typeof(options.action) == "undefined")
      action = "click";
    else
      action = options.action;
    let nodes;
    if (selector === null)
      nodes = [this._domNode];
    else if (typeof(selector) == "string")
      nodes = this._domNode.querySelectorAll(selector);
    else
      nodes = [selector];

    for (let node of nodes)
      node.addEventListener(action, f, false);
  },

}

function linkifySubject(subject, doc) {
  /* utility function to split text and links */
  function linkifySplit(text, doc) {
    let matches = LINKS_REGEX.exec(text);
    let pre, post = null;
    [pre, post] = text.split(matches[1]);
    let link = doc.createElement("a");
    link.appendChild(doc.createTextNode(matches[1]));
    link.setAttribute("href", matches[1]);
    link.setAttribute("title", matches[1]);
    link.setAttribute("class","link");
    link.addEventListener("click", function (event) {
        getMail3Pane().messenger.launchExternalURL(matches[1]);
        event.preventDefault();
      }, false);
    return [pre,link,post];
  }
  let text = subject;
  let node = doc.createElement("span");
  /* loop through multiple possible links in the subject */
  while(text && LINKS_REGEX.test(text)) {
    let pre, link, post = null;
    [pre,link,post] = linkifySplit(text, doc);
    /* we can't assume that any pre or post text was given, only a link */
    if (pre && pre.length > 0)
      node.appendChild(doc.createTextNode(pre));
    node.appendChild(link);
    text = post;
  }
  if (text && text.length > 0) {
    node.appendChild(doc.createTextNode(text));
  }
  return node;
}

/**
 * This is a super-polymorphic function that allows you to get the topmost
 * mail:3pane window from anywhere in the conversation code.
 * - if you're a Contact, use topMail3Pane(this)
 * - if you're a Message, use topMail3Pane(this)
 * - if you're a Conversation, use topMail3Pane(this)
 * - if you're in content/stub.xhtml, use topMail3Pane(window)
 * - if you're in a standalone window, this function makes no sense, and returns
 *   a pointer to _any_ mail:3pane
 */
function topMail3Pane(aObj) {
  if (!aObj)
    throw Error("Bad usage for topMail3Pane");

  let moveOut = function (w) {
    if (w.frameElement)
      return w.frameElement.ownerDocument.defaultView;
    else
      return getMail3Pane();
  };

  if ("_conversation" in aObj) // Message
    return moveOut(aObj._conversation._htmlPane);
  else if ("_htmlPane" in aObj) // Conversation
    return moveOut(aObj._htmlPane);
  else if ("_manager" in aObj) // Contact
    return moveOut(aObj._domNode.ownerDocument.defaultView);
  else // Standalone window, a tab, or in the htmlpane (common case)
    return aObj.top.opener || moveOut(aObj) || aObj.top;
}

function reindexMessages(aMsgHdrs) {
  GlodaMsgIndexer.indexMessages(aMsgHdrs.map(x => [x.folder, x.messageKey]));
}

function folderName(aFolder) {
  let folderStr = aFolder.prettyName;
  let folder = aFolder;
  while (folder.parent) {
    folder = folder.parent;
    folderStr = folder.name + "/" + folderStr;
  }
  return [aFolder.prettyName, folderStr];
}

function openConversationInTabOrWindow(aUrl) {
  let window = getMail3Pane();
  // Counting some extra pixels for window decorations.
  let height = Math.min(window.screen.availHeight-30, 1024);
  switch (Prefs.getInt("mail.openMessageBehavior")) {
    case 0:
      window.open(aUrl, "_blank", "chrome,resizable,width=640,height="+height);
      break;
    case 1:
      window.open(aUrl, "conversations", "chrome,resizable,width=640,height="+height);
      break;
    case 2:
      window.document.getElementById("tabmail").openTab("chromeTab", {
        chromePage: aUrl,
      });
      break;
  }
}
