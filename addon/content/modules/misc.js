/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "setupLogging",
  "groupArray",
  "topMail3Pane",
  "folderName",
  "escapeHtml",
  "parseMimeLine",
  "htmlToPlainText",
  "getMail3Pane",
  "msgUriToMsgHdr",
  "msgHdrGetUri",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "gMessenger", function () {
  return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
});

function setupLogging(name) {
  return console.createInstance({
    prefix: name,
    maxLogLevel: Prefs.logging_enabled ? "Debug" : "Warn",
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
  return orderedIds.map((id) => groups[id]);
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

  let moveOut = function (w) {
    if (w?.frameElement) {
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
  return s.replace(/[<>&]/g, function (s) {
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
    return addresses.map((addr) => {
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

/**
 * Convert HTML into text/plain suitable for insertion right away in the mail
 *  body. If there is text with &gt;'s at the beginning of lines, these will be
 *  space-stuffed, and the same goes for Froms. &lt;blockquote&gt;s will be converted
 *  with the suitable &gt;'s at the beginning of the line, and so on...
 * This function also takes care of rewrapping at 72 characters, so your quoted
 *  lines will be properly wrapped too. This means that you can add some text of
 *  your own, and then pass this to simpleWrap, it should "just work" (unless
 *  the user has edited a quoted line and made it longer than 990 characters, of
 *  course).
 * @param {String} aHtml A string containing the HTML that's to be converted.
 * @return {String} A text/plain string suitable for insertion in a mail body.
 */
function htmlToPlainText(aHtml) {
  // Yes, this is ridiculous, we're instanciating composition fields just so
  //  that they call ConvertBufPlainText for us. But ConvertBufToPlainText
  //  really isn't easily scriptable, so...
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.body = aHtml;
  fields.forcePlainText = true;
  fields.ConvertBodyToPlainText();
  return fields.body;
}

/**
 * Get the main Thunderbird window. Used heavily to get a reference to globals
 *  that are defined in mail/base/content/.
 * @return The window object for the main window.
 */
function getMail3Pane() {
  return Services.wm.getMostRecentWindow("mail:3pane");
}

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 * @param {String} aUri The URI of the message
 * @return {nsIMsgDbHdr}
 */
function msgUriToMsgHdr(aUri) {
  try {
    let messageService = gMessenger.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    dump("Unable to get " + aUri + " — returning null instead");
    return null;
  }
}

/**
 * Get a given message header's uri.
 * @param {nsIMsgDbHdr} aMsg The message
 * @return {String}
 */
function msgHdrGetUri(aMsg) {
  return aMsg.folder.getUriForMsg(aMsg);
}
