/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "setupLogging",
  "topMail3Pane",
  "parseMimeLine",
  "getMail3Pane",
  "msgUriToMsgHdr",
  "msgHdrGetUri",
  "messageActions",
  "setLogState",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MailServices: "resource:///modules/MailServices.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "gMessenger", function () {
  return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
});

let gLoggingEnabled = false;

function setLogState(state) {
  gLoggingEnabled = state;
}

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

function setupLogging(name) {
  return console.createInstance({
    prefix: name,
    maxLogLevel: gLoggingEnabled ? "Debug" : "Warn",
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
