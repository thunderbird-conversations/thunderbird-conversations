/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import { Message } from "./message.mjs";

function getDisplayMessages(msgData, reverseConversationOrder) {
  if (!msgData) {
    return [];
  }
  return reverseConversationOrder ? [...msgData].reverse() : msgData;
}

function getQuickReplyTargetId(msgData) {
  return msgData?.[msgData.length - 1]?.id;
}

/**
 * Handles display of the list of messages.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {object} options.messages
 * @param {object} options.summary
 */
function _MessageList({ dispatch, messages, summary }) {
  // Keep a reference to child elements so `.focus()`
  // can be called on them in response to a `advanceMessage()`
  // call. The actual ref is stored in `React.useRef().current`
  const { current: childRefs } = React.useRef([]);
  const displayMessages = getDisplayMessages(
    messages.msgData,
    summary.prefs.reverseConversationOrder
  );
  const quickReplyTargetId = getQuickReplyTargetId(messages.msgData);

  function setRef(index, ref) {
    childRefs[index] = ref;
  }

  function advanceMessage(index, step) {
    const ref = childRefs[index + step];
    if (!ref) {
      return;
    }
    ref.focus();
  }

  return React.createElement(
    "ul",
    { id: "messageList" },
    displayMessages.map((message, index) =>
        React.createElement(Message, {
          key: index,
          autoMarkAsRead: summary.autoMarkAsRead,
          browserBackgroundColor: summary.browserBackgroundColor,
          browserForegroundColor: summary.browserForegroundColor,
          darkReaderEnabled: summary.darkReaderEnabled,
          defaultFontSize: summary.defaultFontSize,
          dispatch,
          displayingMultipleMsgs: !!messages.length,
          hideQuickReply: summary.prefs.hideQuickReply,
          iframesLoading: summary.iframesLoading,
          index,
          isInTab: summary.isInTab,
          isLastMessage: message.id == quickReplyTargetId,
          isStandalone: summary.isStandalone,
          message,
          tenPxFactor: summary.tenPxFactor,
          prefs: summary.prefs,
          advanceMessage: (step = 1) => {
            advanceMessage(index, step);
          },
          setRef: (ref) => {
            setRef(index, ref);
          },
          tabId: summary.tabId,
          winId: summary.windowId,
        })
      )
  );
}

export const MessageList = ReactRedux.connect(
  /** @param {{messages: object[], summary: object}} state */
  (state) => {
    return {
      messages: state.messages,
      summary: state.summary,
    };
  }
)(_MessageList);
