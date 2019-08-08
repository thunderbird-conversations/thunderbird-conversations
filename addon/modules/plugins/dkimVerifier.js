/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  getMail3Pane: "resource://conversations/modules/stdlib/msgHdrUtils.js",
  registerHook: "resource://conversations/modules/hook.js",
  setupLogging: "resource://conversations/modules/log.js",
});

let Log = setupLogging("Conversations.Modules.DKIMVerifier");

let hasDKIMVerifier = false;
var AuthVerifier;
try {
  AuthVerifier = ChromeUtils.import("resource://dkim_verifier/AuthVerifier.jsm", null).AuthVerifier;
  if (AuthVerifier.version.match(/^[0-9]+/)[0] === "1") {
    hasDKIMVerifier = true;
    Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
  } else {
    Log.debug("DKIM Verifier has incompatible version.");
  }
} catch (e) {
  Log.debug("DKIM Verifier doesn't seem to be installed or has incompatible version.");
}

if (hasDKIMVerifier) {
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

function setTooltip(aDomNode, status, warnings) {
  "use strict";

  let document = getMail3Pane().document;
  warnings = warnings || [];

  let tooltip = document.createElement("span");
  let t_status = document.createElement("div");
  t_status.textContent = status;
  tooltip.appendChild(t_status);

  if (warnings.length > 0) {
    let d = document.createElementNS("http://www.w3.org/1999/xhtml", "hr");
    tooltip.appendChild(d);
  }

  for (let w of warnings) {
    let d = document.createElement("div");
    d.textContent = w;
    tooltip.appendChild(d);
  }

  let dkimTag = aDomNode.querySelector(".keep-tag.tag-dkim-signed");
  dkimTag.appendChild(tooltip);
}

function displayResult(result, aDomNode) {
  "use strict";

  aDomNode.setAttribute("dkimStatus", result.dkim[0].result);

  if (result.dkim[0].res_num <= 30) {
    aDomNode.classList.add("dkim-signed");
    setTooltip(aDomNode, result.dkim[0].result_str, result.dkim[0].warnings_str);
  }
}

let dkimVerifierHook = {
  onMessageStreamed: function _dkimVerifierHook_onMessageStreamed(aMsgHdr, aDomNode/* , aMsgWindow, aMessage*/) {
    "use strict";

    AuthVerifier.verify(aMsgHdr).then(function(result) {
      displayResult(result, aDomNode);
    }, function(exception) {
      Log.debug("Exception in dkimVerifierHook: " + exception);
    });
 },
};

if (hasDKIMVerifier) {
  registerHook(dkimVerifierHook);
  Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
}
