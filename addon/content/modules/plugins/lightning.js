/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["isLightningInstalled"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  registerHook: "chrome://conversations/content/modules/hook.js",
  setupLogging: "chrome://conversations/content/modules/log.js",
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
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
function imipOptions(msgWindow, msg, itipItem, rc, actionFunc, foundItems) {
  // let imipBarText = rootNode.getElementsByClassName("lightningImipText")[0];
  let data = cal.itip.getOptionsText(itipItem, rc, actionFunc);
  let w = topMail3Pane(msg);

  // Set the right globals so that actionFunc works properly.
  w.ltnImipBar.itipItem = itipItem;
  w.ltnImipBar.actionFunc = function(listener, actionMethod) {
    // Short-circuit the listeners so that we can add our own routines for
    // adding the buttons, etc.
    let newListener = {
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
        let label = cal.itip.getCompleteText(aStatus, aOperationType);

        msg._conversation._htmlPane.conversationDispatch({
          type: "MSG_SHOW_NOTIFICATION",
          msgData: {
            msgUri: msg._uri,
            notification: {
              iconName: "calendar_today",
              label,
              type: "lightning",
            },
          },
        });

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

  const idToActionMap = {
    imipAcceptButton: "ACCEPTED",
    imipTentativeButton: "TENTATIVE",
    imipDeclineButton: "DECLINED",
  };

  const buttons = [];

  let addButton = function(c) {
    if (buttons.find(b => b.id == c)) {
      return;
    }
    let originalButtonElement = w.document.getElementById(c);
    buttons.push({
      id: c,
      actionParams: {
        extraData: {
          execute: idToActionMap[c],
        },
      },
      classNames: `imip-button lightningImipButton msgHeaderView-button ${c}`,
      textContent: originalButtonElement.label,
      tooltiptext: originalButtonElement.getAttribute("tooltiptext"),
    });
  };

  // data.buttons tells us which buttons should be shown
  for (let c of data.showItems) {
    if (c != "imipMoreButton") {
      addButton(c);
      // Working around the lack of dropdown buttons. See discussion in bug 1042741
      if (c == "imipAcceptButton" || c == "imipAcceptRecurrencesButton") {
        addButton("imipTentativeButton");
      }
    }
  }

  // Update the Conversation UI
  msg._conversation._htmlPane.conversationDispatch({
    type: "MSG_SHOW_NOTIFICATION",
    msgData: {
      msgUri: msg._uri,
      notification: {
        buttons,
        iconName: "calendar_today",
        label: data.label,
        type: "lightning",
      },
    },
  });
}

let lightningHook = {
  onMessageStreamed(msgHdr, unused, msgWindow, msg) {
    let itipItem = null;
    try {
      let sinkProps = msgWindow.msgHeaderSink.properties;
      itipItem = sinkProps.getPropertyAsInterface("itipItem", Ci.calIItipItem);
    } catch (e) {}

    if (itipItem) {
      let method = msgHdr.getStringProperty("imip_method");
      let label = cal.itip.getMethodText(method);
      cal.itip.initItemFromMsgData(itipItem, method, msgHdr);
      msg._conversation._htmlPane.conversationDispatch({
        type: "MSG_SHOW_NOTIFICATION",
        msgData: {
          msgUri: msg._uri,
          notification: {
            iconName: "calendar_today",
            type: "lightning",
            label,
          },
        },
      });

      cal.itip.processItipItem(
        itipItem,
        imipOptions.bind(null, msgWindow, msg)
      );
    }
  },

  onMessageNotification(win, notificationType, extraData) {
    if (notificationType != "lightning") {
      return;
    }

    win.ltnImipBar.executeAction(extraData.execute);
  },
};

if (hasLightning) {
  registerHook(lightningHook);
  Log.debug("Lightning plugin for Thunderbird Conversations loaded!");
}
