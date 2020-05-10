/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "setupLogging",
  "groupArray",
  "joinWordList",
  "iconForMimeType",
  "arrayEquals",
  "topMail3Pane",
  "folderName",
  "escapeHtml",
  "getIdentityForEmail",
  "getIdentities",
  "parseMimeLine",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  fixIterator: "resource:///modules/iteratorUtils.jsm",
  getMail3Pane: "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  MailServices: "resource:///modules/MailServices.jsm",
  Prefs: "chrome://conversations/content/modules/prefs.js",
});

XPCOMUtils.defineLazyGetter(this, "browser", function() {
  return BrowserSim.getBrowser();
});

function setupLogging(name) {
  return console.createInstance({
    prefix: name,
    maxLogLevel: Prefs.logging_enabled ? "Debug" : "Warn",
  });
}

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
    hd.join(wrap(browser.i18n.getMessage("header.commaSeparator"))) +
    wrap(browser.i18n.getMessage("header.andSeparator")) +
    tl
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
 * Helper function to escape some XML chars, so they display properly in
 *  innerHTML.
 * @param {String} s input text
 * @return {String} The string with &lt;, &gt;, and &amp; replaced by the corresponding entities.
 */
function escapeHtml(s) {
  s += "";
  // stolen from selectionsummaries.js (thanks davida!)
  return s.replace(/[<>&]/g, function(s) {
    switch (s) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      default:
        throw Error("Unexpected match");
    }
  });
}

/**
 * Returns a list of all identities in the form [{ boolean isDefault; nsIMsgIdentity identity }].
 * It is assured that there is exactly one default identity.
 * If only the default identity is needed, getDefaultIdentity() can be used.
 * @param aSkipNntpIdentities (default: true) Should we avoid including nntp identities in the list?
 */
function getIdentities(aSkipNntpIdentities = true) {
  let identities = [];
  // TB 68 has accounts as an nsIArray.
  // TB 78 has accounts an an directly iterable array.
  for (let account of fixIterator(
    MailServices.accounts.accounts,
    Ci.nsIMsgAccount
  )) {
    let server = account.incomingServer;
    if (
      aSkipNntpIdentities &&
      (!server || (server.type != "pop3" && server.type != "imap"))
    ) {
      continue;
    }
    const defaultIdentity = MailServices.accounts.defaultAccount
      ? MailServices.accounts.defaultAccount.defaultIdentity
      : null;
    // TB 68 has identities as an nsIArray.
    // TB 78 has identities an an directly iterable array.
    for (let currentIdentity of fixIterator(
      account.identities,
      Ci.nsIMsgIdentity
    )) {
      // We're only interested in identities that have a real email.
      if (currentIdentity.email) {
        identities.push({
          isDefault: currentIdentity == defaultIdentity,
          identity: currentIdentity,
        });
      }
    }
  }
  if (!identities.length) {
    console.warn("Didn't find any identities!");
  } else if (!identities.some(x => x.isDefault)) {
    console.warn(
      "Didn't find any default key - mark the first identity as default!"
    );
    identities[0].isDefault = true;
  }
  return identities;
}

/*
 * Searches a given email address in all identities and returns the corresponding identity.
 * @param {String} anEmailAddress Email address to be searched in the identities
 * @returns {{Boolean} isDefault, {{nsIMsgIdentity} identity} if found, otherwise undefined
 */
function getIdentityForEmail(anEmailAddress) {
  return getIdentities(false).find(
    ident => ident.identity.email.toLowerCase() == anEmailAddress.toLowerCase()
  );
}

/**
 * Wraps the low-level header parser stuff.
 * @param {String} mimeLine
 *   A line that looks like "John &lt;john@cheese.com&gt;, Jane &lt;jane@wine.com&gt;"
 * @param {Boolean} [dontFix]
 *   Defaults to false. Shall we return an empty array in case aMimeLine is empty?
 * @return {Array}
 *   A list of { email, name } objects
 */
function parseMimeLine(mimeLine, dontFix) {
  if (mimeLine == null) {
    console.debug("Empty aMimeLine?!!");
    return [];
  }
  // The null here copes with pre-Thunderbird 71 compatibility.
  let addresses = MailServices.headerParser.parseEncodedHeader(mimeLine, null);
  if (addresses.length) {
    return addresses.map(addr => {
      return {
        email: addr.email,
        name: addr.name,
        fullName: addr.toString(),
      };
    });
  }
  if (dontFix) {
    return [];
  }
  return [{ email: "", name: "-", fullName: "-" }];
}
