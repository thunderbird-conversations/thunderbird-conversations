/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Conversations, getMail3Pane, messageActions, XPCOMUtils, printConversation */
/* exported summaryActions, summary */

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
});

const initialSummary = {
  browserForegroundColor: "#000000",
  browserBackgroundColor: "#FFFFFF",
  conversation: null,
  defaultFontSize: 15,
  hasBuiltInPdf: false,
  hideQuickReply: false,
  iframesLoading: 0,
  isInTab: false,
  // TODO: What is loading used for?
  loading: true,
  OS: "win",
  tabId: null,
  tenPxFactor: 0.7,
  subject: "",
  windowId: null,
  defaultDetailsShowing: false,
};

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

var summaryActions = {
  replaceConversation({ summary, messages }) {
    return async (dispatch, getState) => {
      await handleShowDetails(messages, getState(), dispatch, () => {
        return dispatch({
          type: "REPLACE_CONVERSATION_DETAILS",
          summary,
          messages,
        });
      });
    };
  },
  appendMessages({ summary, messages }) {
    return async (dispatch, getState) => {
      await handleShowDetails(messages, getState(), dispatch, () => {
        return dispatch({
          type: "APPEND_MESSAGES",
          messages,
        });
      });
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
  sendEmail({ name, email }) {
    return async () => {
      const dest = await browser.convContacts.makeMimeAddress({ name, email });
      await browser.convContacts.composeNew({ to: dest }).catch(console.error);
    };
  },
  createFilter({ email }) {
    return async (dispatch, getState) => {
      browser.conversations
        .createFilter(email, getState().summary.windowId)
        .catch(console.error);
    };
  },
};

function summary(state = initialSummary, action) {
  switch (action.type) {
    case "SET_CONVERSATION_STATE": {
      return {
        ...state,
        isInTab: action.isInTab,
        tabId: action.tabId,
        windowId: action.windowId,
      };
    }
    case "SET_SYSTEM_OPTIONS": {
      let tenPxFactor = 0.625;
      if (action.OS == "mac") {
        tenPxFactor = 0.666;
      } else if (action.OS == "win") {
        tenPxFactor = 0.7;
      }

      let mainVersion = action.browserVersion?.split(".")[0];

      return {
        ...state,
        browserForegroundColor: action.browserForegroundColor,
        browserBackgroundColor: action.browserBackgroundColor,
        defaultFontSize: action.defaultFontSize,
        defaultDetailsShowing: action.defaultDetailsShowing,
        // Thunderbird 81 has built-in PDF viewer.
        hasBuiltInPdf: mainVersion >= 81,
        hideQuickReply: action.hideQuickReply,
        OS: action.OS,
        tenPxFactor,
      };
    }
    case "REPLACE_CONVERSATION_DETAILS": {
      if (!("summary" in action)) {
        return state;
      }
      return {
        ...state,
        ...action.summary,
      };
    }
    case "ADD_CONTACT": {
      browser.convContacts.beginNew({
        email: action.email,
        displayName: action.name,
      });
      // TODO: In theory we should be updating the store so that the button can
      // then be updated to indicate this is now in the address book. However,
      // until we start getting the full conversation messages hooked up, this
      // won't be easy. As this is only a small bit of hidden UI, we can punt on
      // this for now.
      return state;
    }
    case "COPY_EMAIL": {
      navigator.clipboard.writeText(action.email);
      return state;
    }
    case "EDIT_CONTACT": {
      browser.convContacts.beginEdit({
        email: action.email,
      });
      return state;
    }
    case "FORWARD_CONVERSATION": {
      Conversations.currentConversation.forward().catch(console.error);
      return state;
    }
    case "OPEN_LINK": {
      getMail3Pane().messenger.launchExternalURL(action.url);
      return state;
    }
    case "PRINT_CONVERSATION": {
      // TODO: Fix printing
      printConversation();
      return state;
    }
    case "MSG_STREAM_MSG": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading++;
      }
      let message = state.conversation.getMessage(action.msgUri);
      // The message might not be found, if so it has probably been deleted from
      // under us, so just continue and not blow up.
      if (message) {
        message.streamMessage(topMail3Pane(window).msgWindow, action.docshell);
      } else {
        console.warn("Could not find message for streaming", action.msgUri);
      }
      return newState;
    }
    case "MSG_STREAM_LOAD_FINISHED": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading--;
        if (newState.iframesLoading < 0) {
          newState.iframesLoading = 0;
        }
      }
      // It might be that we're trying to send a message on unmount, but the
      // conversation/message has gone away. If that's the case, we just skip
      // and move on.
      if (state.conversation?.getMessage) {
        const msg = state.conversation.getMessage(action.msgUri);
        if (msg) {
          msg.postStreamMessage(topMail3Pane(window), action.iframe);
        }
      }
      return newState;
    }
    default: {
      return state;
    }
  }
}
