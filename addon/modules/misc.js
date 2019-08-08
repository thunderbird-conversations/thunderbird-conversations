/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "groupArray", "joinWordList", "iconForMimeType",
  "EventHelperMixIn", "arrayEquals", "topMail3Pane",
  "folderName", "openConversationInTabOrWindow",
];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  getMail3Pane: "resource://conversations/modules/stdlib/msgHdrUtils.js",
  Prefs: "resource://conversations/modules/prefs.js",
  setupLogging: "resource://conversations/modules/log.js",
  StringBundle: "resource:///modules/StringBundle.js",
});

let Log = setupLogging("Conversations.Misc");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

function arrayEquals(a1, a2) {
  if (a1.length != a2.length)
    return false;

  return a1.every((v, i) => {
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
function joinWordList(aElements, aInsertHtml) {
  let wrap = aInsertHtml
    ? x => "<span>" + x + "</span>"
    : x => x
  ;
  let l = aElements.length;
  if (l == 0) {
    return "";
  } else if (l == 1) {
    return aElements[0];
  }

  let hd = aElements.slice(0, l - 1);
  let tl = aElements[l - 1];
  return hd.join(wrap(strings.get("sepComma"))) + wrap(strings.get("sepAnd")) + tl;
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
  // "message/": "email",
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

function iconForMimeType(aMimeType) {
  let idx = mapping.findIndex(function([k ]) {
    return aMimeType == k;
  });
  if (idx != -1) {
    return mapping[idx][1] + ".svg";
  }
  idx = fallbackMapping.findIndex(function([k ]) {
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
var EventHelperMixIn = {

  compose(compType, shiftKey = false) {
    let window = topMail3Pane(this);
    if (shiftKey) {
      window.ComposeMessage(compType, Ci.nsIMsgCompFormat.OppositeOfDefault, this._msgHdr.folder, [this._uri]);
    } else {
      window.ComposeMessage(compType, Ci.nsIMsgCompFormat.Default, this._msgHdr.folder, [this._uri]);
    }
  },

  forward(shiftKey) {
    let forwardType = 0;
    try {
      forwardType = Prefs.getInt("mail.forward_message_mode");
    } catch (e) {
      Log.error("Unable to fetch preferred forward mode\n");
    }
    if (forwardType == 0)
      this.compose(Ci.nsIMsgCompType.ForwardAsAttachment, shiftKey);
    else
      this.compose(Ci.nsIMsgCompType.ForwardInline, shiftKey);
  },

  register(selector, f, options) {
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
      node.addEventListener(action, f);
  },

};

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

  let moveOut = function(w) {
    if (w.frameElement) {
      return w.frameElement.ownerDocument.defaultView;
    }

    return getMail3Pane();
  };

  if ("_conversation" in aObj) // Message
    return moveOut(aObj._conversation._htmlPane);
  else if ("_htmlPane" in aObj) // Conversation
    return moveOut(aObj._htmlPane);
  else if ("_manager" in aObj) // Contact
    return moveOut(aObj._domNode.ownerDocument.defaultView);

  // Standalone window, a tab, or in the htmlpane (common case)
  return aObj.top.opener || moveOut(aObj) || aObj.top;
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
  let height = Math.min(window.screen.availHeight - 30, 1024);
  switch (Prefs.getInt("mail.openMessageBehavior")) {
    case 0:
      window.open(aUrl, "_blank", "chrome,resizable,width=640,height=" + height);
      break;
    case 1:
      window.open(aUrl, "conversations", "chrome,resizable,width=640,height=" + height);
      break;
    case 2:
      window.document.getElementById("tabmail").openTab("chromeTab", {
        chromePage: aUrl,
      });
      break;
  }
}
