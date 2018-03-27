/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Philippe Lieser <dkim.verifier.addon@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2014
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// options for JSHint
/* jshint strict:true, moz:true, unused:true, jquery:true */
/* global Components */
/* global setupLogging, registerHook, getMail3Pane */
/* global AuthVerifier */
/* exported EXPORTED_SYMBOLS */

var EXPORTED_SYMBOLS = [];

ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
ChromeUtils.import("resource://conversations/modules/hook.js");
ChromeUtils.import("resource://conversations/modules/log.js");

let Log = setupLogging("Conversations.Modules.DKIMVerifier");

let hasDKIMVerifier = false;
try {
  ChromeUtils.import("resource://dkim_verifier/AuthVerifier.jsm");
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
  mailWindow.DKIM_Verifier.Display.onEndHeaders = function () {
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
  onMessageStreamed: function _dkimVerifierHook_onMessageStreamed(aMsgHdr, aDomNode/*, aMsgWindow, aMessage*/) {
    "use strict";

    AuthVerifier.verify(aMsgHdr).then(function (result) {
      displayResult(result, aDomNode);
    }, function (exception) {
      Log.debug("Exception in dkimVerifierHook: " + exception);
    });
 },
};

if (hasDKIMVerifier) {
  registerHook(dkimVerifierHook);
  Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
}
