/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  cal: "resource:///modules/calendar/calUtils.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  messageActions: "chrome://conversations/content/modules/misc.js",
});

// This is a version of setupOptions suitable for Conversations
// see https://searchfox.org/comm-central/rev/6820aaa407ab48a2c1b7a7477015e0dac1dc5daf/calendar/base/content/imip-bar.js#250
function imipOptions(
  win,
  msgId,
  browser,
  itipItem,
  rc,
  actionFunc,
  foundItems
) {
  let data = cal.itip.getOptionsText(itipItem, rc, actionFunc);

  // Set the right globals so that actionFunc works properly.
  win.calImipBar.itipItem = itipItem;
  win.calImipBar.actionFunc = function (listener, actionMethod) {
    // Short-circuit the listeners so that we can add our own routines for
    // adding the buttons, etc.
    let newListener = {
      onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
        let label = cal.itip.getCompleteText(aStatus, aOperationType);

        browser.contentWindow.conversationDispatch(
          messageActions.msgShowNotification({
            msgData: {
              id: msgId,
              notification: {
                iconName: "calendar_today",
                label,
                type: "calendar",
              },
            },
          })
        );

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
    imipGoToCalendarButton: "GOTO",
  };

  const buttons = [];

  let addButton = function (c) {
    if (buttons.find((b) => b.id == c)) {
      return;
    }
    let originalButtonElement = win.document.getElementById(c);
    buttons.push({
      id: c,
      actionParams: {
        extraData: {
          execute: idToActionMap[c],
        },
      },
      classNames: `imip-button calendarImipButton msgHeaderView-button ${c}`,
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
  browser.contentWindow.conversationDispatch(
    messageActions.msgShowNotification({
      msgData: {
        id: msgId,
        notification: {
          buttons,
          iconName: "calendar_today",
          label: data.label,
          type: "calendar",
        },
      },
    })
  );
}

/* exported convCalendar */
var convCalendar = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { tabManager } = extension;
    return {
      convCalendar: {
        onMessageStreamed(tabId, msgId) {
          let tabObject = tabManager.get(tabId);
          if (!tabObject.nativeTab) {
            throw new Error("No tab found");
          }
          let win = Cu.getGlobalForObject(tabObject.nativeTab);
          if (!win) {
            throw new Error("No window found for tab");
          }
          let itipItem = null;
          try {
            let sinkProps = win.msgWindow.msgHeaderSink.properties;
            itipItem = sinkProps.getPropertyAsInterface(
              "itipItem",
              Ci.calIItipItem
            );
          } catch (e) {}

          if (itipItem) {
            let msgHdr = context.extension.messageManager.get(msgId);
            if (!msgHdr) {
              throw new Error("Could not find header for the message");
            }
            let method = msgHdr.getStringProperty("imip_method");
            let label = cal.itip.getMethodText(method);
            cal.itip.initItemFromMsgData(itipItem, method, msgHdr);
            let browser = win.document
              .getElementById("tabmail")
              .getBrowserForTab(tabObject.nativeTab);
            browser.contentWindow.conversationDispatch(
              messageActions.msgShowNotification({
                msgData: {
                  id: msgId,
                  notification: {
                    iconName: "calendar_today",
                    type: "calendar",
                    label,
                  },
                },
              })
            );

            cal.itip.processItipItem(
              itipItem,
              imipOptions.bind(null, win, msgId, browser)
            );
          }
        },
        onMessageNotification(tabId, action) {
          let tabObject = tabManager.get(tabId);
          if (!tabObject.nativeTab) {
            throw new Error("No tab found");
          }
          let win = Cu.getGlobalForObject(tabObject.nativeTab);
          if (!win) {
            throw new Error("No window found for tab");
          }

          if (action == "GOTO") {
            win.calImipBar.goToCalendar();
          } else {
            win.calImipBar.executeAction(action);
          }
        },
      },
    };
  }
};
