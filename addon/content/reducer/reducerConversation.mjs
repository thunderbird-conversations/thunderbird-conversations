/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This reducer is for managing the control flow of loading and updating a
 * conversation.
 */

import * as RTK from "@reduxjs/toolkit";
import { composeSlice } from "./reducerCompose.mjs";
import { controllerActions } from "./controllerActions.mjs";
import { mergeContactDetails, getContactPhotos } from "./contacts.mjs";
import { messageActions } from "./reducerMessages.mjs";
import { MessageEnricher } from "./messageEnricher.mjs";
import { quickReplySlice } from "./reducerQuickReply.mjs";
import { summarySlice } from "./reducerSummary.mjs";

const sortMessages = (m1, m2) => m1.date - m2.date;

export const initialConversation = {
  currentId: 0,
};

let currentId = 0;

let currentQueryListener;
let currentQueryListenerArgs;

let _messageEnricher;
let messageEnricher = () => {
  if (_messageEnricher) {
    return _messageEnricher;
  }
  return (_messageEnricher = new MessageEnricher());
};

async function removeListeners() {
  if (currentQueryListener) {
    await browser.convGloda.queryConversationMessages.removeListener(
      currentQueryListener,
      currentQueryListenerArgs,
      currentId
    );
    currentQueryListener = null;
    currentQueryListenerArgs = null;
  }
}

window.addEventListener(
  "unload",
  () => {
    removeListeners();
  },
  { once: true }
);

async function handleShowDetails(messages, state, dispatch, updateFn) {
  let defaultShowing = state.summary.defaultDetailsShowing;
  for (let msg of messages) {
    msg.detailsShowing = defaultShowing;
  }

  await updateFn();

  if (defaultShowing) {
    for (let msg of messages) {
      await dispatch(
        messageActions.showMsgDetails({
          id: msg.id,
          detailsShowing: true,
        })
      );
    }
  }
}

export const conversationActions = {
  showConversation({ msgIds }) {
    return async (dispatch, getState) => {
      let loadingStartedTime = Date.now();

      await removeListeners();

      currentId = getState().conversation.currentId + 1;
      await dispatch(conversationActions.setConversationId({ currentId }));
      await dispatch(composeSlice.actions.resetStore());
      await dispatch(
        quickReplySlice.actions.setExpandedState({ expanded: false })
      );

      if (!msgIds.length) {
        console.error("Could not find any messages to load");
        await dispatch(
          summarySlice.actions.setMessagesNotFound({ notFound: true })
        );
        return;
      }
      await dispatch(
        summarySlice.actions.setMessagesNotFound({ notFound: false })
      );

      currentQueryListener = (event) => {
        if (event.conversationId != currentId) {
          console.warn(
            "Conversation Query Listener called after being removed"
          );
          return;
        }
        if (event.initial) {
          dispatch(
            conversationActions.displayConversationMsgs({
              msgs: event.initial,
              initialSet: msgIds,
              loadingStartedTime,
            })
          );
        } else if (event.added) {
          dispatch(
            conversationActions.addConversationMsgs({
              msgs: event.added,
            })
          );
        } else if (event.modified) {
          dispatch(
            conversationActions.modifyConversationMsgs({
              msgs: event.modified,
            })
          );
        } else if (event.removed) {
          dispatch(
            messageActions.removeMessages({
              msgs: event.removed,
            })
          );
        }
      };
      currentQueryListenerArgs = msgIds;

      browser.convGloda.queryConversationMessages.addListener(
        currentQueryListener,
        currentQueryListenerArgs,
        currentId
      );
    };
  },
  displayConversationMsgs({ msgs, initialSet, loadingStartedTime }) {
    return async (dispatch, getState) => {
      let currentState = getState();
      await handleShowDetails(msgs, currentState, dispatch, async () => {
        let phase2StartTime = Date.now();
        let messages = msgs
          .map((msg, i) => {
            return {
              ...msg,
              initialPosition: i,
              detailsShowing: false,
            };
          })
          .sort(sortMessages);

        let summary = { initialSet };

        if (currentState.summary.prefs.loggingEnabled) {
          console.log(
            "Displaying",
            msgs.map((m) => ({
              id: m.id,
              headerMessageId: m.headerMessageId,
            }))
          );
        }

        // The messages need some more filling out and tweaking.
        let enrichedMsgs = await messageEnricher().enrich(
          messages,
          currentState.summary,
          initialSet
        );

        // Do expansion and scrolling after gathering the message data
        // as this relies on the message read information.
        messageEnricher().determineExpansion(
          enrichedMsgs,
          currentState.summary.prefs.expandWho,
          initialSet
        );

        // The messages inside `msgData` don't come with filled in `to`/`from`/etc.
        // fields. We need to fill them in ourselves.
        await mergeContactDetails(enrichedMsgs);

        summary.loading = false;
        summary.subject = enrichedMsgs[enrichedMsgs.length - 1]?.subject;

        await dispatch(summarySlice.actions.replaceSummaryDetails(summary));

        await dispatch(
          messageActions.replaceConversation({ messages: enrichedMsgs })
        );

        if (currentState.summary.prefs.loggingEnabled) {
          console.debug(
            "Conversations:",
            "Load took (ms):",
            Date.now() - loadingStartedTime
          );
          console.debug(
            "Conversations:",
            "Second phase took (ms):",
            Date.now() - phase2StartTime
          );
        }
        // TODO: Fix this for the standalone message view, so that we send
        // the correct notifications.
        if (!currentState.summary.isInTab) {
          await browser.conversations.fireLoadCompleted({
            tabId: currentState.summary.tabId,
          });
        }
        await dispatch(controllerActions.maybeSetMarkAsRead());

        // Set this off, but don't wait for it.
        getContactPhotos(enrichedMsgs, dispatch);
      });
    };
  },
  addConversationMsgs({ msgs }) {
    return async (dispatch, getState) => {
      let currentState = getState();

      if (currentState.summary.prefs.loggingEnabled) {
        console.log(
          "Adding",
          msgs.map((m) => ({
            id: m.id,
            headerMessageId: m.headerMessageId,
          }))
        );
      }

      // TODO: Maybe in future replace messages from a different
      // folder with ones in the current folder?
      let currentMsgCount = currentState.messages.msgData.length;
      let messages = msgs
        .filter((msg) => {
          let found = currentState.messages.msgData.find(
            (m) => m.headerMessageId == msg.headerMessageId
          );
          return !found;
        })
        .map((msg, i) => {
          return {
            ...msg,
            initialPosition: i + currentMsgCount,
            detailsShowing: false,
          };
        })
        .sort(sortMessages);

      // The messages need some more filling out and tweaking.
      let enrichedMsgs = await messageEnricher().enrich(
        messages,
        currentState.summary,
        currentState.summary.initialSet
      );

      for (let msg of enrichedMsgs) {
        messageEnricher().markExpansionForAddedMsg(
          msg,
          currentState.summary.prefs.expandWho
        );
      }

      // The messages inside `msgData` don't come with filled in `to`/`from`/ect. fields.
      // We need to fill them in ourselves.
      await mergeContactDetails(enrichedMsgs);

      await dispatch(
        messageActions.addMessages({
          msgs: enrichedMsgs,
        })
      );
    };
  },
  modifyConversationMsgs({ msgs }) {
    return async (dispatch, getState) => {
      let currentState = getState();

      if (currentState.summary.prefs.loggingEnabled) {
        console.log(
          "Modifying",
          msgs.map((m) => ({
            id: m.id,
            headerMessageId: m.headerMessageId,
          }))
        );
      }
      // The messages need some more filling out and tweaking.
      let enrichedMsgs = await messageEnricher().enrich(
        msgs,
        currentState.summary,
        currentState.summary.initialSet
      );
      await dispatch(
        messageActions.updateMessages({
          msgs: enrichedMsgs,
        })
      );
    };
  },
};

export const conversationSlice = RTK.createSlice({
  name: "conversation",
  initialState: initialConversation,
  reducers: {
    setConversationId(state, { payload }) {
      return { ...state, currentId: payload.currentId };
    },
  },
});

Object.assign(conversationActions, conversationSlice.actions);
