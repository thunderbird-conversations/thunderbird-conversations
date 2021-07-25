/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "setupLogging",
  "topMail3Pane",
  "escapeHtml",
  "parseMimeLine",
  "htmlToPlainText",
  "getMail3Pane",
  "msgUriToMsgHdr",
  "msgHdrGetUri",
  "messageActions",
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

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

function setupLogging(name) {
  return console.createInstance({
    prefix: name,
    maxLogLevel: Prefs.logging_enabled ? "Debug" : "Warn",
  });
}

/**
 * This is a super-polymorphic function that allows you to get the topmost
 * mail:3pane window from anywhere in the conversation code.
 * - if you're a Contact, use topMail3Pane(this)
 * - if you're a Message, use topMail3Pane(this)
 * - if you're a Conversation, use topMail3Pane(this)
 * - if you're in content/stub.html, use topMail3Pane(window)
 * - if you're in a standalone window, this function makes no sense, and returns
 *   a pointer to _any_ mail:3pane
 *
 * @param {object} aObj
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
  }

  // Standalone window, a tab, or in the htmlpane (common case)
  return aObj.top.opener || moveOut(aObj) || aObj.top;
}

/**
 * Helper function to escape some XML chars, so they display properly in
 *  innerHTML.
 *
 * @param {string} s input text
 * @returns {string} The string with &lt;, &gt;, and &amp; replaced by the corresponding entities.
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
 *
 * @param {string} mimeLine
 *   A line that looks like "John &lt;john@cheese.com&gt;, Jane &lt;jane@wine.com&gt;"
 * @param {boolean} [dontFix]
 *   Defaults to false. Shall we return an empty array in case aMimeLine is empty?
 * @returns {Array}
 *   A list of { email, name } objects
 */
function parseMimeLine(mimeLine, dontFix) {
  if (mimeLine == null) {
    console.debug("Empty aMimeLine?!!");
    return [];
  }
  let addresses = MailServices.headerParser.parseEncodedHeader(mimeLine);
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
 *
 * @param {string} aHtml A string containing the HTML that's to be converted.
 * @returns {string} A text/plain string suitable for insertion in a mail body.
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
 *
 * @returns {object} The window object for the main window.
 */
function getMail3Pane() {
  return Services.wm.getMostRecentWindow("mail:3pane");
}

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 *
 * @param {string} aUri The URI of the message
 * @returns {nsIMsgDBHdr}
 */
function msgUriToMsgHdr(aUri) {
  try {
    let messageService = gMessenger.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    console.error("Unable to get ", aUri, " — returning null instead");
    return null;
  }
}

/**
 * Get a given message header's uri.
 *
 * @param {nsIMsgDBHdr} aMsg The message
 * @returns {string}
 */
function msgHdrGetUri(aMsg) {
  return aMsg.folder.getUriForMsg(aMsg);
}

/**
 * We cannot import `messageActions` directly, so we fake the actions object
 * until all non-web extension code is removed
 */
var messageActions = new Proxy(
  {},
  {
    get(target, prop) {
      return (payload) => ({ type: `messages/${prop}`, payload });
    },
  }
);
