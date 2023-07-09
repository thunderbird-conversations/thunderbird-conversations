/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as RTK from "@reduxjs/toolkit";
import { conversationUtils } from "./conversationUtils.js";
import { messageActions } from "./reducerMessages.js";

export const initialSummary = {
  autoMarkAsRead: true,
  browserForegroundColor: "#000000",
  browserBackgroundColor: "#FFFFFF",
  conversation: null,
  defaultFontSize: 15,
  iframesLoading: 0,
  isInTab: false,
  isStandalone: false,
  // TODO: What is loading used for?
  loading: true,
  messageNotFound: false,
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

async function isPhishing(iframe, msg) {
  // If this message has form nodes, it could be phishing, so see if we
  // should warn the user.
  if (
    !iframe.contentWindow.document.querySelectorAll("form[action]").length ||
    !browser.conversations.getCorePref("mail.phishing.detection.enabled")
  ) {
    return false;
  }

  // Conversations doesn't display for nntp/rss, so we assume we don't
  // need to filter out those messages.

  // If it is an outgoing message, don't notify about it.
  if (
    msg.isArchives ||
    msg.isDraft ||
    msg.isOutbox ||
    msg.isSent ||
    msg.isTemplate
  ) {
    return false;
  }

  return browser.conversations.getCorePref(
    "mail.phishing.detection.disallow_form_actions"
  );
}

export const summaryActions = {
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
      let dest = await browser.convContacts.makeMimeAddress({
        name,
        email,
      });
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
  editContact({ contactId }) {
    return () => {
      browser.convContacts.beginEdit({
        contactId,
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
      browser.windows.openDefaultBrowser(url);
    };
  },
  printConversation() {
    return async (dispatch, getState) => {
      let state = getState();
      let winId = state.summary.windowId;
      for (let msg of state.messages.msgData) {
        if (msg.expanded) {
          await dispatch(
            messageActions.setPrintBody({
              id: msg.id,
              printBody: await browser.conversations.bodyAsText({
                winId,
                tabId: state.summary.tabId,
                msgId: msg.id,
              }),
            })
          );
        }
      }
      window.print();
    };
  },
  forwardConversation() {
    return async (dispatch, getState) => {
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
  msgStreamLoadFinished({ dueToExpansion, id, iframe }) {
    return async (dispatch, getState) => {
      if (!dueToExpansion) {
        dispatch(summarySlice.actions.decIframesLoading());
      }

      let state = getState();
      let msg = state.messages.msgData.find((m) => m.id == id);

      if (await isPhishing(iframe, msg)) {
        dispatch(
          messageActions.setPhishing({
            id,
            isPhishing: true,
          })
        );
      }

      await browser.convOpenPgp.handleMessageStreamed(
        getState().summary.winId,
        getState().summary.tabId,
        id
      );
    };
  },
  msgStreamMsg({ dueToExpansion, id, iframe, dueToReload = false }) {
    return async (dispatch, getState) => {
      if (!dueToExpansion) {
        dispatch(summarySlice.actions.incIframesLoading());
      }
      let state = getState();
      await browser.convOpenPgp.beforeStreamingMessage(
        state.summary.tabId,
        id,
        dueToReload
      );
      let options = {
        msgId: id,
        iframeClass: `convIframe${id}`,
      };
      if (state.summary.isStandalone) {
        options.winId = state.summary.windowId;
      } else {
        options.tabId = state.summary.tabId;
      }
      let result = await browser.conversations
        .streamMessage(options)
        .catch(console.error);

      // Pretends we've finished loading the message if we're not displaying the
      // message, e.g. due to being in a WebExtension context.
      if (!result) {
        dispatch(
          summaryActions.msgStreamLoadFinished({
            dueToExpansion: this.dueToExpansion,
            id,
            iframe,
          })
        );
      }
    };
  },
  messageUnloaded({ msgId }) {
    return async (dispatch, getState) => {
      let state = getState();
      await browser.convCalendar.messageUnloaded(
        state.summary.winId,
        state.summary.tabId,
        msgId
      );
    };
  },
};

export const summarySlice = RTK.createSlice({
  name: "summary",
  initialState: initialSummary,
  reducers: {
    setMessagesNotFound(state, { payload }) {
      return { ...state, messageNotFound: payload.notFound };
    },
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
        autoMarkAsRead,
        browserForegroundColor,
        browserBackgroundColor,
        defaultFontSize,
        defaultDetailsShowing,
      } = payload;
      let tenPxFactor = 0.625;
      if (OS == "mac") {
        tenPxFactor = 0.666;
      } else if (OS == "win") {
        tenPxFactor = 0.7;
      }

      return {
        ...state,
        autoMarkAsRead,
        browserForegroundColor,
        browserBackgroundColor,
        defaultFontSize,
        defaultDetailsShowing,
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
