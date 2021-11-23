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
  // console.log(toUTF8(toBytes(aMsg.folder.getUriForMsg(aMsg))));
  // if folder name contains non latin character, it fails to get message from URI
  // so here we're trying to fix encoding..
  return toUTF8(toBytes(aMsg.folder.getUriForMsg(aMsg)));
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

function toBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xff);
  }

  return byteArray;
}

function toUTF8(bytes) {
  var res = "";
  var tmp = "";
  var i = 0;
  while (i < bytes.length) {
    if (bytes[i] <= 0x7f) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(bytes[i]);
      tmp = "";
    } else {
      tmp += "%" + bytes[i].toString(16);
    }

    i++;
  }

  return res + decodeUtf8Char(tmp);
}

function decodeUtf8Char(str) {
  try {
    return decodeURIComponent(str);
  } catch (err) {
    return String.fromCharCode(0xfffd); // UTF 8 invalid char
  }
}
