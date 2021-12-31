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
import { mergeContactDetails } from "./contacts.js";
import { MessageEnricher } from "./messageEnricher.js";
import { messageActions } from "./reducerMessages.js";
import { composeSlice } from "./reducerCompose.js";
import { summaryActions, summarySlice } from "./reducerSummary.js";
import { quickReplySlice } from "./reducerQuickReply.js";

let loggingEnabled = false;
let markAsReadTimer;
let messageEnricher;

async function handleShowDetails(messages, state, dispatch, updateFn) {
  let defaultShowing = state.summary.defaultDetailsShowing;
  for (let msg of messages.msgData) {
    msg.detailsShowing = defaultShowing;
  }

  await updateFn();

  if (defaultShowing) {
    for (let msg of state.messages.msgData) {
      await dispatch(
        messageActions.showMsgDetails({
          id: msg.id,
          detailsShowing: true,
        })
      );
    }
  }
}

// TODO: Once the WebExtension parts work themselves out a bit more,
// determine if this is worth sharing via a shared module with the background
// scripts, or if it doesn't need it.

// TODO: remove isInTab?
async function setupConversationInTab(params, isInTab, dispatch) {
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
    // window.Conversations = {
    //   currentConversation: null,
    //   counter: 0,
    // };
    //
    // let freshConversation = new Conversation(
    //   window,
    //   msgUrls,
    //   ++window.Conversations.counter,
    //   isInTab
    // );
    let browserFrame = window.frameElement;
    // Because Thunderbird still hasn't fixed that...
    if (browserFrame) {
      browserFrame.setAttribute("context", "mailContext");
    }
    //
    // window.Conversations.currentConversation = freshConversation;
    // freshConversation.outputInto(window);
  }
}

export const controllerActions = {
  waitForStartup() {
    return async (dispatch, getState) => {
      const params = new URL(document.location).searchParams;

      const isInTab = params.has("urls");
      const isStandalone = params.has("standalone");
      const topWin = window.browsingContext.topChromeWindow;

      // Note: Moving this to after the check for started below is dangerous,
      // since it introduces races where `Conversation` doesn't wait for the
      // page to startup, and hence tab id isn't set.
      let windowId = BrowserSim.getWindowId(topWin);
      await dispatch(
        summaryActions.setConversationState({
          isInTab,
          isStandalone,
          tabId: isStandalone ? -1 : BrowserSim.getTabId(topWin, window),
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

      // if (!isInTab) {
      //   return;
      // }

      let mainWindow = isStandalone
        ? window.browsingContext.topChromeWindow.opener
        : window.browsingContext.topChromeWindow;
      if (!mainWindow.Conversations?.finishedStartup) {
        await new Promise((resolve, reject) => {
          let tries = 0;
          function checkStarted() {
            if (
              mainWindow.Conversations &&
              mainWindow.Conversations.finishedStartup
            ) {
              resolve();
            } else {
              // Wait up to 10 seconds, if it is that slow we're in trouble.
              if (tries >= 100) {
                console.error(
                  "Failed waiting for monkeypatch to finish startup"
                );
                reject();
                return;
              }
              tries++;
              setTimeout(checkStarted, 100);
            }
          }
          checkStarted();
        });
      }
      await dispatch(
        controllerActions.initializeMessageThread({ isInTab: true, params })
      );
    };
  },

  initializeMessageThread({ isInTab, params }) {
    return async (dispatch, getState) => {
      if (getState().summary.isInTab) {
        console.log("conversation in tab");
        setupConversationInTab(params, isInTab, dispatch).catch(console.error);
      } else {
        let msgIds = await browser.convMsgWindow.getSelectedMessages(
          getState().summary.tabId
        );
        // let selectedMessages = [];
        // for (let id of initialMessages) {
        //   selectedMessages.push(await browser.conversations.getMessageUriForId(id));
        // }

        dispatch(conversationActions.showConversation({ msgIds }));
        // TODO: window should be mainWindow?
        // let freshConversation = new Conversation(
        //   window,
        //   selectedMessages,
        //   ++window.Conversations.counter
        // );
        // // TODO: log-only
        // console.debug(
        //   "New conversation:",
        //   freshConversation.counter,
        //   "Old conversation:",
        //   window.Conversations.currentConversation?.counter
        // );
        // window.Conversations.currentConversation?.cleanup();
        // window.Conversations.currentConversation = freshConversation;
        // freshConversation.outputInto(window);
      }
    };
  },

  /**
   * Update a conversation either replacing or appending the messages.
   *
   * @param {object} root0
   * @param {object} [root0.summary]
   *   Only applies to replacing a conversation, the summary details to update.
   * @param {object} root0.messages
   *   The messages to insert or append.
   * @param {string} root0.mode
   *   Can be "append", "replaceAll" or "replaceMsg". replaceMsg will replace
   *   only a single message.
   */
  updateConversation({ summary, messages, mode }) {
    return async (dispatch, getState) => {
      const state = getState();

      if (!messageEnricher) {
        // Delayed init to make sure browser has time to be defined.
        messageEnricher = new MessageEnricher();
      }

      await handleShowDetails(messages, state, dispatch, async () => {
        // The messages need some more filling out and tweaking.
        let enrichedMsgs = await messageEnricher.enrich(
          mode,
          messages.msgData,
          state.summary,
          mode == "replaceAll" ? summary.initialSet : state.summary.initialSet
        );

        // The messages inside `msgData` don't come with filled in `to`/`from`/ect. fields.
        // We need to fill them in ourselves.
        await mergeContactDetails(enrichedMsgs);

        if (mode == "replaceAll") {
          summary.subject = enrichedMsgs[enrichedMsgs.length - 1]?.subject;

          await dispatch(composeSlice.actions.resetStore());
          await dispatch(
            quickReplySlice.actions.setExpandedState({ expanded: false })
          );
          await dispatch(summaryActions.replaceSummaryDetails(summary));
        }

        await dispatch(
          messageActions.updateConversation({ messages: enrichedMsgs, mode })
        );

        if (mode == "replaceAll") {
          if (loggingEnabled) {
            console.debug(
              "Load took (ms):",
              Date.now() - summary.loadingStartedTime
            );
          }
          // TODO: Fix this for the standalone message view, so that we send
          // the correct notifications.
          if (!state.summary.isInTab) {
            await browser.convMsgWindow.fireLoadCompleted();
          }
          await dispatch(this.maybeSetMarkAsRead());
        }
      });
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

function onMsgHasRemoteContent(dispatch, id) {
  dispatch(
    messageActions.setHasRemoteContent({
      id,
      hasRemoteContent: true,
    })
  );
}

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

/**
 * Sets up any listeners required.
 *
 * @param {Function} dispatch
 *   The action dispatcher.
 * @param {Function} getState
 *   Function to get the current store state.
 */
function setupListeners(dispatch, getState) {
  let windowId = getState().summary.windowId;

  async function msgSelectionChanged() {
    let msgIds = await browser.convMsgWindow.getSelectedMessages(
      getState().summary.tabId
    );
    dispatch(conversationActions.showConversation({ msgIds }));
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

  function printListener(winId, msgId) {
    if (windowId != winId) {
      return;
    }
    let state = getState();
    if (!state.messages.msgData.find((m) => m.id == msgId)) {
      return;
    }
    browser.convMsgWindow.print(winId, `convIframe${msgId}`);
  }

  browser.convMsgWindow.onSelectedMessagesChanged.addListener(
    msgSelectionChanged,
    windowId
  );
  browser.messageDisplay.onMessagesDisplayed.addListener(
    selectionChangedListener
  );
  browser.convMsgWindow.onPrint.addListener(printListener);

  let remoteContentListener = onMsgHasRemoteContent.bind(this, dispatch);
  browser.convMsgWindow.onMsgHasRemoteContent.addListener(
    remoteContentListener
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

  window.addEventListener(
    "unload",
    () => {
      browser.convMsgWindow.onSelectedMessagesChanged.removeListener(
        msgSelectionChanged,
        windowId
      );
      browser.messageDisplay.onMessagesDisplayed.removeListener(
        selectionChangedListener
      );
      browser.convMsgWindow.onPrint.removeListener(printListener);
      browser.convMsgWindow.onMsgHasRemoteContent.removeListener(
        remoteContentListener
      );
      browser.convOpenPgp.onUpdateSecurityStatus.removeListener(
        updateSecurityStatusListener
      );
      browser.convOpenPgp.onSMIMEStatus.removeListener(
        updateSecurityStatusListener
      );
      browser.convOpenPgp.onSMIMEReload.removeListener(smimeReloadListener);
      window.Conversations?.currentConversation?.cleanup();
    },
    { once: true }
  );
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
