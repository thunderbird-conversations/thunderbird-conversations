/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["isLightningInstalled"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  registerHook: "resource://conversations/modules/hook.js",
  setupLogging: "resource://conversations/modules/log.js",
  topMail3Pane: "resource://conversations/modules/misc.js",
});

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
function imipOptions(
  rootNode,
  msgWindow,
  message,
  itipItem,
  rc,
  actionFunc,
  foundItems
) {
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
        for (let button of rootNode.getElementsByClassName(
          "lightningImipButton"
        )) {
          button.style.display = "none";
        }

        // In case it's useful
        listener.onOperationComplete(
          aCalendar,
          aStatus,
          aOperationType,
          aId,
          aDetail
        );
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
    buttonElement.setAttribute(
      "tooltiptext",
      originalButtonElement.getAttribute("tooltiptext")
    );
    buttonElement.textContent = originalButtonElement.label;
  };

  // data.buttons tells us which buttons should be shown
  for (let c of data.showItems) {
    if (c != "imipMoreButton") {
      showButton(c);
      // Working around the lack of dropdown buttons. See discussion in bug 1042741
      if (c == "imipAcceptButton" || c == "imipAcceptRecurrencesButton") {
        showButton("imipTentativeButton");
      }
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
    } catch (e) {}

    if (itipItem) {
      let method = aMsgHdr.getStringProperty("imip_method");
      let label = cal.itip.getMethodText(method);
      cal.itip.initItemFromMsgData(itipItem, method, aMsgHdr);

      imipBarText.textContent = label;

      cal.itip.processItipItem(
        itipItem,
        imipOptions.bind(null, aDomNode, aMsgWindow, aMessage)
      );
      imipBar.style.display = "block";
    }
  },
};

if (hasLightning) {
  registerHook(lightningHook);
  Log.debug("Lightning plugin for Thunderbird Conversations loaded!");
}
