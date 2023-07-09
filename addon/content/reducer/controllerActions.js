/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This reducer is for managing the control flow of the stub page. Handling
 * triggering of actions related to the loading of conversations data and
 * subsequent display.
 */

/* global BrowserSim */
import { conversationActions } from "./reducerConversation.js";
import { messageActions } from "./reducerMessages.js";
import { summaryActions, summarySlice } from "./reducerSummary.js";

let loggingEnabled = false;
let markAsReadTimer;

// TODO: Once the WebExtension parts work themselves out a bit more,
// determine if this is worth sharing via a shared module with the background
// scripts, or if it doesn't need it.

async function setupConversationInTab(params, dispatch) {
  if (window.frameElement) {
    window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
  }
  const msgUrls = params.get("urls").split(",");
  const msgIds = [];
  // TODO: The params should become ids at some stage, but we don't currently
  // have a firm API for easily persisting message idnetifiers across restarts.
  for (const url of msgUrls) {
    const id = await browser.conversations.getMessageIdForUri(url);
    if (id) {
      msgIds.push(id);
    }
  }
  // It might happen that there are no messages left...
  if (!msgIds.length) {
    document.getElementById("messageList").textContent =
      browser.i18n.getMessage("message.movedOrDeletedConversation");
  } else {
    dispatch(conversationActions.showConversation({ msgIds }));

    let browserFrame = window.frameElement;
    // Because Thunderbird still hasn't fixed that...
    if (browserFrame) {
      browserFrame.setAttribute("context", "mailContext");
    }
  }
}

export const controllerActions = {
  waitForStartup() {
    return async (dispatch, getState) => {
      const params = new URL(document.location).searchParams;

      const isInTab = params.has("urls");
      const isStandalone = params.has("standalone");

      // Note: Moving this to after the check for started below is dangerous,
      // since it introduces races where `Conversation` doesn't wait for the
      // page to startup, and hence tab id isn't set.
      let windowId;
      let tabId;
      if (!BrowserSim && isInTab) {
        windowId = (await browser.windows.getCurrent()).id;
        tabId = (await browser.tabs.getCurrent()).id;
      } else {
        const topWin = window.browsingContext.topChromeWindow;
        windowId = BrowserSim.getWindowId(topWin);
        tabId = isStandalone ? null : BrowserSim.getTabId(topWin, window);
      }

      await dispatch(
        summaryActions.setConversationState({
          isInTab,
          isStandalone,
          tabId,
          windowId,
        })
      );

      setupListeners(dispatch, getState);
      await setupUserPreferences(dispatch, getState);

      const platformInfo = await browser.runtime.getPlatformInfo();
      const defaultFontSize = await browser.conversations.getCorePref(
        "font.size.variable.x-western"
      );
      const browserForegroundColor = await browser.conversations.getCorePref(
        "browser.display.foreground_color"
      );
      const browserBackgroundColor = await browser.conversations.getCorePref(
        "browser.display.background_color"
      );
      const defaultDetailsShowing =
        (await browser.conversations.getCorePref("mail.show_headers")) == 2;
      const autoMarkAsRead =
        (await browser.conversations.getCorePref(
          "mailnews.mark_message_read.auto"
        )) &&
        !(await browser.conversations.getCorePref(
          "mailnews.mark_message_read.delay"
        ));

      await dispatch(
        summaryActions.setSystemOptions({
          autoMarkAsRead,
          browserForegroundColor,
          browserBackgroundColor,
          defaultDetailsShowing,
          defaultFontSize,
          OS: platformInfo.os,
        })
      );

      if (getState().summary.prefs.loggingEnabled) {
        loggingEnabled = true;
        console.debug(`Initializing ${isInTab ? "tab" : "message pane"} view.`);
      }

      await dispatch(controllerActions.initializeMessageThread({ params }));
    };
  },

  initializeMessageThread({ params }) {
    return async (dispatch, getState) => {
      let state = getState();
      if (state.summary.isInTab) {
        setupConversationInTab(params, dispatch).catch(console.error);
      } else {
        let msgIds = await browser.messageDisplay.getDisplayedMessages(
          state.summary.tabId
        );

        dispatch(
          conversationActions.showConversation({
            msgIds: msgIds.map((m) => m.id),
          })
        );
      }
    };
  },

  /**
   * Handles potentially marking a conversation as read.
   */
  maybeSetMarkAsRead() {
    return async (dispatch, getState) => {
      let state = getState();

      let autoMarkRead = await browser.conversations.getCorePref(
        "mailnews.mark_message_read.auto"
      );
      if (autoMarkRead) {
        let delay = 0;
        let shouldDelay = await browser.conversations.getCorePref(
          "mailnews.mark_message_read.delay"
        );
        if (shouldDelay) {
          delay =
            (await browser.conversations.getCorePref(
              "mailnews.mark_message_read.delay.interval"
            )) * 1000;
        }
        markAsReadTimer = setTimeout(async function () {
          markAsReadTimer = null;

          if (state.summary.initialSet.length > 1) {
            // If we're selecting a thread, mark thee whole conversation as read.
            // Note: if two or more in different threads are selected, then
            // the conversation UI is not used. Hence why this is ok to do here.
            if (state.summary.prefs.loggingEnabled) {
              console.debug(
                "Conversations:",
                "Marking the whole conversation as read"
              );
            }
            for (let msg of state.messages.msgData) {
              if (!msg.read) {
                await dispatch(messageActions.markAsRead({ id: msg.id }));
              }
            }
          } else {
            // We only have a single message selected, mark that as read.
            if (state.summary.prefs.loggingEnabled) {
              console.debug(
                "Conversations:",
                "Marking selected message as read"
              );
            }
            // We use the selection from the initial set, just in case something
            // changed before we hit the timer.
            await dispatch(
              messageActions.markAsRead({ id: state.summary.initialSet[0] })
            );
          }
        }, delay);
      }
    };
  },
};

async function onUpdateSecurityStatus(
  dispatch,
  { id, signedStatus, encryptionStatus, encryptionNotification, details }
) {
  if (signedStatus) {
    let classNames = "";
    let title = "";
    let name = "";
    switch (signedStatus) {
      case "good":
        classNames = "success";
        name = browser.i18n.getMessage("enigmail.messageSigned");
        title = browser.i18n.getMessage("enigmail.messageSignedLong");
        break;
      case "warn":
        classNames = "warning";
        name = browser.i18n.getMessage("enigmail.messageSigned");
        title = browser.i18n.getMessage("enigmail.unknownGood");
        break;
      case "bad":
        classNames = "error";
        name = browser.i18n.getMessage("enigmail.messageBadSignature");
        title = browser.i18n.getMessage("enigmail.messageBadSignatureLong");
        break;
    }
    await dispatch(
      messageActions.msgAddSpecialTag({
        id,
        tagDetails: {
          // canClick: true,
          classNames,
          icon: "material-icons.svg#edit",
          name,
          details: {
            type: "enigmail",
            detail: "viewSecurityInfo",
            displayInfo: details,
          },
          title,
          type: "openPgpSigned",
        },
      })
    );
  }
  if (!encryptionStatus) {
    return;
  }

  if (encryptionStatus == "good") {
    dispatch(
      messageActions.msgAddSpecialTag({
        id,
        tagDetails: {
          classNames: "success",
          icon: "material-icons.svg#vpn_key",
          name: browser.i18n.getMessage("enigmail.messageDecrypted"),
          details: {
            type: "enigmail",
            detail: "viewSecurityInfo",
            displayInfo: details,
          },
          title: browser.i18n.getMessage("enigmail.messageDecryptedLong"),
          type: "openPgpEncrypted",
        },
      })
    );
    return;
  }
  if (encryptionStatus == "bad") {
    if (encryptionNotification) {
      dispatch(
        messageActions.msgShowNotification({
          msgData: {
            id,
            notification: {
              iconName: "dangerous",
              label: encryptionNotification,
              type: "openpgp",
            },
          },
        })
      );
    }
  }
}

function onSmimeReload(dispatch, id) {
  if (loggingEnabled) {
    console.log("smimeReloadListener", id);
  }
  dispatch(
    messageActions.setSmimeReload({
      id,
      smimeReload: true,
    })
  );
}

function onExternalMessages(dispatch, msg) {
  switch (msg.type) {
    case "addSpecialTag": {
      dispatch(
        messageActions.msgAddSpecialTag({
          tagDetails: {
            classNames: msg.classNames,
            icon: msg.icon,
            name: msg.message,
            tooltip: {
              strings: msg.tooltip,
            },
          },
          id: msg.id,
        })
      );
      break;
    }
    case "showNotification": {
      dispatch(
        messageActions.msgShowNotification({
          msgData: msg.msgData,
        })
      );
    }
  }
}

let unloadListeners;

/**
 * Sets up any listeners required.
 *
 * @param {Function} dispatch
 *   The action dispatcher.
 * @param {Function} getState
 *   Function to get the current store state.
 */
function setupListeners(dispatch, getState) {
  async function msgSelectionChanged(msgs) {
    dispatch(
      conversationActions.showConversation({ msgIds: msgs.map((m) => m.id) })
    );
  }

  function selectionChangedListener(tab) {
    let state = getState();
    if (state.summary.tabId != tab.id) {
      return;
    }
    if (markAsReadTimer) {
      clearTimeout(markAsReadTimer);
      markAsReadTimer = null;
    }
  }

  function invitesListener({ msgId, notification }) {
    let notificationDetails = { ...notification, buttons: [] };

    for (let button of notification.buttons) {
      notificationDetails.buttons.push({
        ...button,
        textContent:
          browser.i18n.getMessage(`calendar.${button.id}.label`) ?? "",
        tooltiptext:
          browser.i18n.getMessage(`calendar.${button.id}.tooltip`) ?? "",
      });
    }

    dispatch(
      messageActions.msgShowNotification({
        msgData: { id: msgId, notification: notificationDetails },
      })
    );
  }

  let state = getState();
  let tabId = state.summary.tabId;
  let winId = state.summary.isStandalone ? state.summary.windowId : undefined;
  browser.convMsgWindow.onSelectedMessagesChanged.addListener(
    msgSelectionChanged,
    tabId
  );
  browser.messageDisplay.onMessagesDisplayed.addListener(
    selectionChangedListener
  );
  browser.convCalendar.onListenForInvites.addListener(
    invitesListener,
    winId,
    tabId
  );

  let updateSecurityStatusListener = onUpdateSecurityStatus.bind(
    this,
    dispatch
  );
  let smimeReloadListener = onSmimeReload.bind(this, dispatch);
  browser.convOpenPgp.onUpdateSecurityStatus.addListener(
    updateSecurityStatusListener
  );
  browser.convOpenPgp.onSMIMEStatus.addListener(updateSecurityStatusListener);
  browser.convOpenPgp.onSMIMEReload.addListener(smimeReloadListener);
  let port = browser.runtime.connect({ name: "externalMessages" });
  let externalMessagesListener = onExternalMessages.bind(this, dispatch);
  port.onMessage.addListener(externalMessagesListener);

  unloadListeners = () => {
    unloadListeners = null;
    window.removeEventListener("unload", unloadListeners, { once: true });

    browser.convCalendar.onListenForInvites.removeListener(
      invitesListener,
      winId,
      tabId
    );

    browser.convMsgWindow.onSelectedMessagesChanged.removeListener(
      msgSelectionChanged,
      tabId
    );
    browser.messageDisplay.onMessagesDisplayed.removeListener(
      selectionChangedListener
    );
    browser.convOpenPgp.onUpdateSecurityStatus.removeListener(
      updateSecurityStatusListener
    );
    browser.convOpenPgp.onSMIMEStatus.removeListener(
      updateSecurityStatusListener
    );
    browser.convOpenPgp.onSMIMEReload.removeListener(smimeReloadListener);
    port.onMessage.removeListener(externalMessagesListener);
    port.disconnect();
  };
  window.addEventListener("unload", unloadListeners, { once: true });
}

/**
 * Sets up getting user preferences for a conversation.
 *
 * @param {Function} dispatch
 *   The action dispatcher.
 * @param {Function} getState
 *   Function to get the current store state.
 */
async function setupUserPreferences(dispatch, getState) {
  const prefs = await browser.storage.local.get("preferences");

  function setPrefs(newPrefs = {}) {
    return dispatch(
      summarySlice.actions.setUserPreferences({
        // Default is expand auto.
        expandWho: newPrefs.preferences?.expand_who ?? 4,
        extraAttachments: newPrefs.preferences?.extra_attachments ?? false,
        hideQuickReply: newPrefs.preferences?.hide_quick_reply ?? false,
        hideQuoteLength: newPrefs.preferences?.hide_quote_length ?? 5,
        hideSigs: newPrefs.preferences?.hide_sigs ?? false,
        loggingEnabled: newPrefs.preferences?.logging_enabled ?? false,
        noFriendlyDate: newPrefs.preferences?.no_friendly_date ?? false,
        operateOnConversations:
          newPrefs.preferences?.operate_on_conversations ?? false,
        tweakBodies: newPrefs.preferences?.tweak_bodies ?? true,
        tweakChrome: newPrefs.preferences?.tweak_chrome ?? true,
      })
    );
  }

  async function prefListener(changed, areaName) {
    if (
      areaName != "local" ||
      !("preferences" in changed) ||
      !("newValue" in changed.preferences)
    ) {
      return;
    }

    const newPrefs = await browser.storage.local.get("preferences");
    setPrefs(newPrefs);
  }
  browser.storage.onChanged.addListener(prefListener);
  window.addEventListener(
    "unload",
    () => {
      browser.storage.onChanged.removeListener(prefListener);
    },
    { once: true }
  );

  await setPrefs(prefs);
}

globalThis.conversationControllerActions = controllerActions;
