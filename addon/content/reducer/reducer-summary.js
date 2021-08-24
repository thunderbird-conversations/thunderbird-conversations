/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Conversations, getMail3Pane, topMail3Pane, printConversation */
import * as RTK from "@reduxjs/toolkit";
import { conversationUtils } from "./conversationUtils.js";
import { messageActions } from "./reducer-messages.js";

export const initialSummary = {
  browserForegroundColor: "#000000",
  browserBackgroundColor: "#FFFFFF",
  conversation: null,
  defaultFontSize: 15,
  hasBuiltInPdf: false,
  hasIdentityParamsForCompose: false,
  iframesLoading: 0,
  isInTab: false,
  isStandalone: false,
  // TODO: What is loading used for?
  loading: true,
  OS: "win",
  tabId: null,
  tenPxFactor: 0.7,
  subject: "",
  windowId: null,
  defaultDetailsShowing: false,
  initialSet: [],
  prefs: {
    expandWho: 4,
    extraAttachments: false,
    hideQuickReply: false,
    hideQuoteLength: 5,
    hideSigs: false,
    loggingEnabled: false,
    noFriendlyDate: false,
    operateOnConversations: false,
    tweakBodies: true,
    tweakChrome: true,
  },
};

let markAsReadTimer;

export const summaryActions = {
  /**
   * Sets up any listeners required.
   */
  setupListeners() {
    return async (dispatch, getState) => {
      let state = getState();
      function selectionChangedListener(tab) {
        if (state.summary.tabId != tab.id) {
          return;
        }
        if (markAsReadTimer) {
          clearTimeout(markAsReadTimer);
          markAsReadTimer = null;
        }
      }

      browser.messageDisplay.onMessagesDisplayed.addListener(
        selectionChangedListener
      );
      window.addEventListener(
        "unload",
        () => {
          browser.messageDisplay.onMessagesDisplayed.removeListener(
            selectionChangedListener
          );
        },
        { once: true }
      );
    };
  },
  /**
   * Sets up getting user preferences for a conversation.
   */
  setupUserPreferences() {
    return async (dispatch, getState) => {
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

      browser.storage.onChanged.addListener(async (changed, areaName) => {
        if (
          areaName != "local" ||
          !("preferences" in changed) ||
          !("newValue" in changed.preferences)
        ) {
          return;
        }

        const newPrefs = await browser.storage.local.get("preferences");
        setPrefs(newPrefs);
      });

      await setPrefs(prefs);
    };
  },
  showMessagesInvolving({ name, email }) {
    return async (dispatch, getState) => {
      await browser.convContacts
        .showMessagesInvolving({
          email,
          title: browser.i18n.getMessage("involvingTabTitle", [name]),
          windowId: getState().summary.windowId,
        })
        .catch(console.error);
    };
  },
  sendEmail({ msgId, name, email }) {
    return async (dispatch, getState) => {
      let state = getState();
      let dest = await browser.convContacts.makeMimeAddress({
        name,
        email,
      });
      if (state.summary.hasIdentityParamsForCompose) {
        let msg = getState().messages.msgData.find((m) => m.id == msgId);
        let account = await browser.accounts.get(msg.folderAccountId);
        let identityId;
        if (!account) {
          identityId = (await browser.accounts.list())[0].identityId;
        } else {
          identityId = account.identities[0]?.id;
        }
        await browser.compose.beginNew({
          identityId,
          to: dest,
        });
      } else {
        await browser.convContacts
          .composeNew({ to: dest })
          .catch(console.error);
      }
    };
  },
  createFilter({ email }) {
    return async (dispatch, getState) => {
      browser.conversations
        .createFilter(email, getState().summary.windowId)
        .catch(console.error);
    };
  },
  copyEmail({ email }) {
    return () => {
      navigator.clipboard.writeText(email);
    };
  },
  editContact({ email }) {
    return () => {
      browser.convContacts.beginEdit({
        email,
      });
    };
  },
  addContact({ email, name }) {
    return () => {
      browser.convContacts.beginNew({
        email,
        displayName: name,
      });
      // TODO: In theory we should be updating the store so that the button can
      // then be updated to indicate this is now in the address book. However,
      // until we start getting the full conversation messages hooked up, this
      // won't be easy. As this is only a small bit of hidden UI, we can punt on
      // this for now.
    };
  },
  openLink({ url }) {
    return () => {
      if ("openDefaultBrowser" in browser.windows) {
        browser.windows.openDefaultBrowser(url);
      } else {
        getMail3Pane().messenger.launchExternalURL(url);
      }
    };
  },
  printConversation() {
    return () => {
      // TODO: Fix printing
      printConversation();
    };
  },
  forwardConversation() {
    return async (dispay, getState) => {
      try {
        let state = getState();
        await conversationUtils.forward(
          state.summary.tabId,
          state.messages.msgData
        );
      } catch (e) {
        console.error(e);
      }
    };
  },
  msgStreamLoadFinished({ dueToExpansion, msgUri, iframe }) {
    return async (dispatch, getState) => {
      if (!dueToExpansion) {
        dispatch(summarySlice.actions.decIframesLoading());
      }
      // It might be that we're trying to send a message on unmount, but the
      // conversation/message has gone away. If that's the case, we just skip
      // and move on.
      if (Conversations.currentConversation?.getMessage) {
        let msg = Conversations.currentConversation.getMessage(msgUri);
        if (msg) {
          msg.postStreamMessage(topMail3Pane(window), iframe);
        }
      }
    };
  },
  msgStreamMsg({ dueToExpansion, msgUri, docshell }) {
    return async (dispatch, getState) => {
      if (!dueToExpansion) {
        dispatch(summarySlice.actions.incIframesLoading());
      }
      let msg = Conversations.currentConversation.getMessage(msgUri);
      // The message might not be found, if so it has probably been deleted from
      // under us, so just continue and not blow up.
      if (msg) {
        msg.streamMessage(topMail3Pane(window).msgWindow, docshell);
      } else {
        console.warn("Could not find message for streaming", msgUri);
      }
    };
  },
  setMarkAsRead() {
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
              console.debug("Marking the whole conversation as read");
            }
            for (let msg of state.messages.msgData) {
              if (!msg.read) {
                await dispatch(messageActions.markAsRead({ id: msg.id }));
              }
            }
          } else {
            // We only have a single message selected, mark that as read.
            if (state.summary.prefs.loggingEnabled) {
              console.debug("Marking selected message as read");
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

export const summarySlice = RTK.createSlice({
  name: "summary",
  initialState: initialSummary,
  reducers: {
    incIframesLoading(state) {
      return { ...state, iframesLoading: state.iframesLoading + 1 };
    },
    decIframesLoading(state) {
      return {
        ...state,
        // Never decrement below zero
        iframesLoading: Math.max(state.iframesLoading - 1, 0),
      };
    },
    setConversationState(state, { payload }) {
      const { isInTab, isStandalone, tabId, windowId } = payload;
      return { ...state, isInTab, isStandalone, tabId, windowId };
    },
    setSystemOptions(state, { payload }) {
      const {
        OS,
        browserForegroundColor,
        browserBackgroundColor,
        defaultFontSize,
        defaultDetailsShowing,
        browserVersion,
      } = payload;
      let tenPxFactor = 0.625;
      if (OS == "mac") {
        tenPxFactor = 0.666;
      } else if (OS == "win") {
        tenPxFactor = 0.7;
      }

      let [mainVersion, minorVersion] = browserVersion?.split(".");

      return {
        ...state,
        browserForegroundColor,
        browserBackgroundColor,
        defaultFontSize,
        defaultDetailsShowing,
        // Thunderbird 81 has built-in PDF viewer.
        hasBuiltInPdf: mainVersion >= 81,
        hasIdentityParamsForCompose:
          mainVersion > 78 || (mainVersion == 78 && minorVersion >= 6),
        OS,
        tenPxFactor,
      };
    },
    setUserPreferences(state, { payload }) {
      return {
        ...state,
        prefs: {
          ...state.prefs,
          ...payload,
        },
      };
    },
    replaceSummaryDetails(state, { payload }) {
      if (payload) {
        return { ...state, ...payload };
      }
      return state;
    },
  },
});

// We don't really care about drawing a distinction between
// actions and thunks, so we make the actions and thunks
// available from the same object.
Object.assign(summaryActions, summarySlice.actions);

globalThis.conversationSummaryActions = summaryActions;
