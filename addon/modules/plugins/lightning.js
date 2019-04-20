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
 * The Original Code is Mozilla Calendar code.
 *
 * The Initial Developer of the Original Code is
 *   Philipp Kewisch <mozilla@kewis.ch>
 * Portions created by the Initial Developer are Copyright (C) 2011
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

var EXPORTED_SYMBOLS = ["isLightningInstalled"];

const {registerHook} =
  ChromeUtils.import("resource://conversations/modules/hook.js", {});
const {setupLogging} =
  ChromeUtils.import("resource://conversations/modules/log.js", {});
const {topMail3Pane} =
  ChromeUtils.import("resource://conversations/modules/misc.js", {});

let Log = setupLogging("Conversations.Modules.Lightning");

function isLightningInstalled() {
  return hasLightning;
}

let hasLightning = false;
let cal;
try {
  cal = ChromeUtils.import("resource://calendar/modules/calUtils.jsm").cal;
  hasLightning = true;
} catch (e) {
  Log.debug("Did you know, Thunderbird Conversations supports Lightning?");
}

// This is a version of setupOptions suitable for Conversations
// see http://mxr.mozilla.org/comm-central/source/calendar/lightning/content/imip-bar.js#186
function imipOptions(rootNode, msgWindow, message, itipItem, rc, actionFunc, foundItems) {
  let imipBarText = rootNode.getElementsByClassName("lightningImipText")[0];
  let data = cal.itip.getOptionsText(itipItem, rc, actionFunc);
  let w = topMail3Pane(message);

  // Set the right globals so that actionFunc works properly.
  w.ltnImipBar.itipItem = itipItem;
  w.ltnImipBar.actionFunc = function(listener, actionMethod) {
    // Short-circuit the listeners so that we can add our own routines for
    // adding the buttons, etc.
    let newListener = {
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
        let label = cal.itip.getCompleteText(aStatus, aOperationType);
        imipBarText.textContent = label;

        // Hide all buttons
        for (let button of rootNode.getElementsByClassName("lightningImipButton"))
          button.style.display = "none";

        // In case it's useful
        listener.onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail);
      },

      onGetResult() {},
    };

    actionFunc(newListener, actionMethod);
  };

  // Update the Conversation UI
  imipBarText.textContent = data.label;

  let showButton = function(c) {
    let buttonElement = rootNode.getElementsByClassName(c)[0];
    let originalButtonElement = w.document.getElementById(buttonElement.id);
    // Show the button!
    buttonElement.style.display = "block";
    // Fill in the right tooltip and label by re-using the original (hidden)
    // elements.
    buttonElement.setAttribute("tooltiptext", originalButtonElement.getAttribute("tooltiptext"));
    buttonElement.textContent = originalButtonElement.label;
  };

  // data.buttons tells us which buttons should be shown
  for (let c of data.showItems) {
    if (c != "imipMoreButton") {
      showButton(c);
      // Working around the lack of dropdown buttons. See discussion in bug 1042741
      if (c == "imipAcceptButton" || c == "imipAcceptRecurrencesButton")
        showButton("imipTentativeButton");
    }
  }
}

let lightningHook = {
  onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow, aMessage) {
    let imipBar = aDomNode.getElementsByClassName("lightningImipBar")[0];
    let imipBarText = aDomNode.getElementsByClassName("lightningImipText")[0];

    let itipItem = null;
    try {
      let sinkProps = aMsgWindow.msgHeaderSink.properties;
      itipItem = sinkProps.getPropertyAsInterface("itipItem", Ci.calIItipItem);
    } catch (e) {
    }

    if (itipItem) {
      let method = aMsgHdr.getStringProperty("imip_method");
      let label = cal.itip.getMethodText(method);
      cal.itip.initItemFromMsgData(itipItem, method, aMsgHdr);

      imipBarText.textContent  = label;

      cal.itip.processItipItem(itipItem, imipOptions.bind(null, aDomNode, aMsgWindow, aMessage));
      imipBar.style.display = "block";
    }
  },
};

if (hasLightning) {
  registerHook(lightningHook);
  Log.debug("Lightning plugin for Thunderbird Conversations loaded!");
}
