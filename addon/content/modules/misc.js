/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [
  "setupLogging",
  "msgUriToMsgHdr",
  "msgHdrGetUri",
  "messageActions",
  "setLogState",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

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
