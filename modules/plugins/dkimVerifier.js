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
/* global Components, Services */
/* global StringBundle, setupLogging, msgHdrGetUri, registerHook, getMail3Pane */
/* global Verifier, dkimStrings, tryGetString, tryGetFormattedString */
/* exported EXPORTED_SYMBOLS */

var EXPORTED_SYMBOLS = [];

const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm"); // https://developer.mozilla.org/en/JavaScript_code_modules/Services.jsm
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/modules/hook.js");
Cu.import("resource://conversations/modules/log.js");

let Log = setupLogging("Conversations.Modules.DKIMVerifier");

let dkimPrefs = Services.prefs.getBranch("extensions.dkim_verifier.");

let hasDKIMVerifier;
try {
  Cu.import("resource://dkim_verifier/dkimVerifier.jsm");
  Cu.import("resource://dkim_verifier/helper.jsm");
  hasDKIMVerifier = true;
  Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
} catch (e) {
  hasDKIMVerifier = false;
  Log.debug("DKIM Verifier doesn't seem to be installed...");
}

if (hasDKIMVerifier) {
  let mailWindow = getMail3Pane();
  let onEndHeaders = mailWindow.DKIM_Verifier.Display.onEndHeaders;
  mailWindow.DKIM_Verifier.Display.onEndHeaders = function () {
    "use strict";

    // don't start a verification for the classic view if it is not shown
    if (getMail3Pane().document.getElementById("singlemessage").getAttribute("hidden") != "true") {
      onEndHeaders();
    }
  };
}

/*
 * save result
 */
function saveResult(msgHdr, result) {
  "use strict";

  if (dkimPrefs.getBoolPref("saveResult")) {
    // don't save result if message is external
    if (!msgHdr.folder) {
      return;
    }

    if (result === "") {
      Log.debug("reset result");
      msgHdr.setStringProperty("dkim_verifier@pl-result", "");
    } else {
      Log.debug("save result");
      msgHdr.setStringProperty("dkim_verifier@pl-result", JSON.stringify(result));
    }
  }
}

/*
 * get result
 */
function getResult(msgHdr) {
  "use strict";

  if (dkimPrefs.getBoolPref("saveResult")) {
    // don't read result if message is external
    if (!msgHdr.folder) {
      return null;
    }

    let result = msgHdr.getStringProperty("dkim_verifier@pl-result");

    if (result !== "") {
      Log.debug("result found: "+result);

      result = JSON.parse(result);

      if (result.version.match(/^[0-9]+/)[0] !== "1") {
        Log.error("Result has wrong Version ("+result.version+")");
        result = null;
      }

      return result;
    }
  }

  return null;
}

function resultCallback(result, aMsgHdr, aDomNode) {
  "use strict";

  // don't save result if it's a TEMPFAIL
  if (result.result !== "TEMPFAIL") {
    saveResult(aMsgHdr, result);
  }
  displayResult(result, aDomNode);
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

  aDomNode.setAttribute("dkimStatus", result.result);
  let status;

  switch(result.result) {
    case "none":
      break;
    case "SUCCESS":
      status = dkimStrings.getFormattedString("SUCCESS", [result.SDID]);
      let warnings;

      // show warnings
      if (result.warnings.length > 0) {
        aDomNode.setAttribute("warnings", "true");
        warnings = result.warnings.map(function(e) {
          if (e === "DKIM_POLICYERROR_WRONG_SDID") {
            return tryGetFormattedString(dkimStrings, e, [result.shouldBeSignedBy]) || e;
          } else {
            return tryGetString(dkimStrings, e) || e;
          }
        });
      }
      aDomNode.classList.add("dkim-signed");
      setTooltip(aDomNode, status, warnings);

      break;
    case "PERMFAIL":
      // if domain is testing DKIM
      // or hideFail is set to true,
      // treat msg as not signed
      if (result.errorType === "DKIM_SIGERROR_KEY_TESTMODE" ||
          result.hideFail) {
        break;
      }

      let errorMsg;
      switch (result.errorType) {
        case "DKIM_POLICYERROR_MISSING_SIG":
        case "DKIM_POLICYERROR_WRONG_SDID":
          errorMsg = tryGetFormattedString(dkimStrings, result.errorType, [result.shouldBeSignedBy]) ||
            result.errorType;
          break;
        default :
          errorMsg = tryGetString(dkimStrings, result.errorType) ||
            result.errorType;
      }
      status = dkimStrings.getFormattedString("PERMFAIL", [errorMsg]);
      aDomNode.classList.add("dkim-signed");
      setTooltip(aDomNode, status);

      break;
    case "TEMPFAIL":
      status = tryGetString(dkimStrings, result.errorType) ||
        result.errorType ||
        dkimStrings.getString("DKIM_INTERNALERROR_NAME");
      aDomNode.classList.add("dkim-signed");
      setTooltip(aDomNode, status);
      break;
    default:
      Log.error("unkown result");
  }
}

let dkimVerifierHook = {
  onMessageStreamed: function _dkimVerifierHook_onMessageStreamed(aMsgHdr, aDomNode/*, aMsgWindow, aMessage*/) {
    "use strict";

    // check for saved result
    var result = getResult(aMsgHdr);
    if (result !== null) {
      displayResult(result, aDomNode);
      return;
    }
    Verifier.verify(msgHdrGetUri(aMsgHdr),
      function(msgURI, result) {
        resultCallback(result, aMsgHdr, aDomNode);
      }
    );
 },
};

if (hasDKIMVerifier) {
  registerHook(dkimVerifierHook);
  Log.debug("DKIM Verifier plugin for Thunderbird Conversations loaded!");
}
