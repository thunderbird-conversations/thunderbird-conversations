/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = [];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  getMail3Pane: "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  registerHook: "chrome://conversations/content/modules/hook.js",
  setupLogging: "chrome://conversations/content/modules/log.js",
  StringBundle: "resource:///modules/StringBundle.js",
});

let Log = setupLogging("Conversations.Modules.DKIMVerifier");

let hasDKIMVerifier = false;
var AuthVerifier;
try {
  AuthVerifier = ChromeUtils.import(
    "resource://dkim_verifier/AuthVerifier.jsm",
    null
  ).AuthVerifier;
  if (AuthVerifier.version.match(/^[0-9]+/)[0] === "1") {
    hasDKIMVerifier = true;
    Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
  } else {
    Log.debug("DKIM Verifier has incompatible version.");
  }
} catch (e) {
  Log.debug(
    "DKIM Verifier doesn't seem to be installed or has incompatible version."
  );
}

let stringBundle;

if (hasDKIMVerifier) {
  stringBundle = new StringBundle(
    "chrome://conversations/locale/template.properties"
  );

  let mailWindow = getMail3Pane();
  let onEndHeaders = mailWindow.DKIM_Verifier.Display.onEndHeaders;
  mailWindow.DKIM_Verifier.Display.onEndHeaders = function() {
    "use strict";

    // don't start a verification for the classic view if it is not shown
    if (getMail3Pane().gMessageDisplay.singleMessageDisplay === true) {
      onEndHeaders();
    }
  };
}

function displayResult(result, msg) {
  if (result.dkim[0].result == "none" || result.dkim[0].res_num > 30) {
    return;
  }

  const warningsClassName =
    result.dkim[0].warnings_str && result.dkim[0].warnings_str.length
      ? "warnings"
      : "";

  msg.addSpecialTag({
    canClick: false,
    classNames: `dkim-signed ${warningsClassName} ${result.dkim[0].result}`,
    icon: "chrome://conversations/skin/material-icons.svg#edit",
    name: stringBundle.get("messageDKIMSigned"),
    tooltip: {
      type: "dkim",
      strings: [result.dkim[0].result_str, result.dkim[0].warnings_str],
    },
  });
}

let dkimVerifierHook = {
  onMessageStreamed(msgHdr, domNode, msgWindow, msg) {
    "use strict";

    AuthVerifier.verify(msgHdr).then(
      result => {
        displayResult(result, msg);
      },
      exception => {
        Log.debug("Exception in dkimVerifierHook: " + exception);
      }
    );
  },
};

if (hasDKIMVerifier) {
  registerHook(dkimVerifierHook);
  Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
}
