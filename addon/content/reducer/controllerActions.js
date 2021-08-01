/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This reducer is for managing the control flow of the stub page. Handling
 * triggering of actions related to the loading of conversations data and
 * subsequent display.
 */

/* global Conversation, BrowserSim, topMail3Pane */
import { mergeContactDetails } from "./contacts.js";
import { messageEnricher } from "./messages.js";
import { messageActions } from "./reducer-messages.js";
import { composeSlice } from "./reducer-compose.js";
import { summaryActions } from "./reducer-summary.js";
import { quickReplySlice } from "./reducer-quickReply.js";

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

async function setupConversationInTab(params, isInTab) {
  if (window.frameElement) {
    window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
  }
  const msgUrls = params.get("urls").split(",");
  const msgIds = [];
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
    window.Conversations = {
      currentConversation: null,
      counter: 0,
    };

    let freshConversation = new Conversation(
      window,
      // TODO: This should really become ids at some stage, but we need to
      // teach Conversation how to handle those.
      msgUrls,
      ++window.Conversations.counter,
      isInTab
    );
    let browserFrame = window.frameElement;
    // Because Thunderbird still hasn't fixed that...
    if (browserFrame) {
      browserFrame.setAttribute("context", "mailContext");
    }

    freshConversation.outputInto(window, async function (aConversation) {
      // This is a stripped-down version of what's in msgWindowApi.js,
      //  make sure the two are in sync!
      window.Conversations.currentConversation = aConversation;
      // Create a new rule that will override the default rule, so that
      // the expanded quick reply is twice higher.
      document.body.classList.add("inTab");
      // Do this now so as to not defeat the whole expand/collapse
      // logic.
      if (
        await browser.conversations.getCorePref(
          "mailnews.mark_message_read.auto"
        )
      ) {
        const markAsReadAfterDelay = await browser.conversations.getCorePref(
          "mailnews.mark_message_read.delay"
        );
        let markAsReadDelay = 0;
        if (markAsReadAfterDelay) {
          markAsReadDelay = await browser.conversations.getCorePref(
            "mailnews.mark_message_read.delay.interval"
          );
        }
        setTimeout(function () {
          for (const id of msgIds) {
            browser.messages.update(id, { read: true }).catch(console.error);
          }
        }, markAsReadDelay * 1000);
      }
    });
  }
}

export const controllerActions = {
  waitForStartup() {
    return async (dispatch, getState) => {
      const params = new URL(document.location).searchParams;

      const isInTab = params.has("urls");
      const isStandalone = params.has("standalone");
      const topWin = topMail3Pane(window);

      // Note: Moving this to after the check for started below is dangerous,
      // since it introduces races where `Conversation` doesn't wait for the
      // page to startup, and hence tab id isn't set.
      await dispatch(
        summaryActions.setConversationState({
          isInTab,
          isStandalone,
          tabId: BrowserSim.getTabId(topWin, window),
          windowId: BrowserSim.getWindowId(topWin),
        })
      );

      await dispatch(summaryActions.setupListeners());
      await dispatch(summaryActions.setupUserPreferences());

      const platformInfo = await browser.runtime.getPlatformInfo();
      const browserInfo = await browser.runtime.getBrowserInfo();
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

      await dispatch(
        summaryActions.setSystemOptions({
          browserForegroundColor,
          browserBackgroundColor,
          browserVersion: browserInfo.version,
          defaultDetailsShowing,
          defaultFontSize,
          OS: platformInfo.os,
        })
      );

      if (getState().summary.prefs.loggingEnabled) {
        console.debug(`Initializing ${isInTab ? "tab" : "message pane"} view.`);
      }

      if (!isInTab) {
        return;
      }

      await new Promise((resolve, reject) => {
        let tries = 0;
        function checkStarted() {
          let mainWindow = topMail3Pane(window);
          if (
            mainWindow.Conversations &&
            mainWindow.Conversations.finishedStartup
          ) {
            resolve();
          } else {
            // Wait up to 10 seconds, if it is that slow we're in trouble.
            if (tries >= 100) {
              console.error("Failed waiting for monkeypatch to finish startup");
              reject();
              return;
            }
            tries++;
            setTimeout(checkStarted, 100);
          }
        }
        checkStarted();
      });
      await dispatch(
        controllerActions.initializeMessageThread({ isInTab: true, params })
      );
    };
  },

  initializeMessageThread({ isInTab, params }) {
    return async (dispatch, getState) => {
      if (getState().summary.isInTab) {
        setupConversationInTab(params, isInTab).catch(console.error);
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
      await handleShowDetails(messages, state, dispatch, async () => {
        // The messages need some more filling out and tweaking.
        await messageEnricher.enrich(
          mode,
          messages.msgData,
          state.summary,
          mode == "replaceAll" ? summary.initialSet : state.summary.initialSet
        );

        // The messages inside `msgData` don't come with filled in `to`/`from`/ect. fields.
        // We need to fill them in ourselves.
        await mergeContactDetails(messages.msgData);

        if (mode == "replaceAll") {
          summary.subject =
            messages.msgData[messages.msgData.length - 1]?.subject;

          await dispatch(composeSlice.actions.resetStore());
          await dispatch(
            quickReplySlice.actions.setExpandedState({ expanded: false })
          );
          await dispatch(summaryActions.replaceSummaryDetails(summary));
        }

        await dispatch(messageActions.updateConversation({ messages, mode }));

        if (mode == "replaceAll") {
          if (state.summary.prefs.loggingEnabled) {
            console.debug(
              "Load took (ms):",
              Date.now() - summary.loadingStartedTime
            );
          }
          await dispatch(summaryActions.setMarkAsRead());
        }
      });
    };
  },
};

globalThis.conversationControllerActions = controllerActions;
