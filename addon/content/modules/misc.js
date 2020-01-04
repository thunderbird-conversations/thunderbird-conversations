/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "groupArray",
  "joinWordList",
  "iconForMimeType",
  "arrayEquals",
  "topMail3Pane",
  "folderName",
  "makeConversationUrl",
  "openConversationInTabOrWindow",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  getMail3Pane: "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});

let strings = new StringBundle(
  "chrome://conversations/locale/template.properties"
);

function arrayEquals(a1, a2) {
  if (a1.length != a2.length) {
    return false;
  }

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
  let wrap = aInsertHtml ? x => "<span>" + x + "</span>" : x => x;
  let l = aElements.length;
  if (l == 0) {
    return "";
  } else if (l == 1) {
    return aElements[0];
  }

  let hd = aElements.slice(0, l - 1);
  let tl = aElements[l - 1];
  return (
    hd.join(wrap(strings.get("sepComma"))) + wrap(strings.get("sepAnd")) + tl
  );
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
  let idx = mapping.findIndex(function([k]) {
    return aMimeType == k;
  });
  if (idx != -1) {
    return mapping[idx][1] + ".svg";
  }
  idx = fallbackMapping.findIndex(function([k]) {
    return aMimeType.startsWith(k);
  });
  if (idx != -1) {
    return fallbackMapping[idx][1] + ".svg";
  }
  return "gtk-file.png";
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
  if (!aObj) {
    throw Error("Bad usage for topMail3Pane");
  }

  let moveOut = function(w) {
    if (w.frameElement) {
      return w.frameElement.ownerGlobal;
    }

    return getMail3Pane();
  };

  if ("_conversation" in aObj) {
    // Message
    return moveOut(aObj._conversation._htmlPane);
  } else if ("_htmlPane" in aObj) {
    // Conversation
    return moveOut(aObj._htmlPane);
  } else if ("_manager" in aObj) {
    // Contact
    return moveOut(aObj._domNode.ownerGlobal);
  }

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

/**
 * Makes a conversation url for opening in new windows/tabs.
 *
 * @param {Array} urls
 *   An array of urls to be opened.
 * @param {Integer} [scrollMode]
 *   The scroll mode to use.
 */
function makeConversationUrl(urls, scrollMode) {
  let queryString = "?urls=" + encodeURIComponent(urls.join(","));

  if (scrollMode) {
    queryString += "&scrollMode=" + scrollMode;
  }
  return Prefs.kStubUrl + queryString;
}

/**
 * Opens a conversation in a new tab or window.
 *
 * @param {Array} urls
 *   An array of urls to be opened.
 * @param {Integer} [scrollMode]
 *   The scroll mode to use.
 */
function openConversationInTabOrWindow(urls, scrollMode) {
  let url = makeConversationUrl(urls, scrollMode);

  let window = getMail3Pane();
  // Counting some extra pixels for window decorations.
  let height = Math.min(window.screen.availHeight - 30, 1024);
  switch (Services.prefs.getIntPref("mail.openMessageBehavior")) {
    case 0:
      window.open(url, "_blank", "chrome,resizable,width=640,height=" + height);
      break;
    case 1:
      window.open(
        url,
        "conversations",
        "chrome,resizable,width=640,height=" + height
      );
      break;
    case 2:
      window.document.getElementById("tabmail").openTab("chromeTab", {
        chromePage: url,
      });
      break;
  }
}
