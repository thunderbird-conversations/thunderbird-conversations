/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { ActionButton } from "./messageActionButton.mjs";
import { messageActions } from "../../reducer/reducerMessages.mjs";

/**
 * Handles display for the footer of a message.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {number} options.id
 * @param {boolean} options.multipleRecipients
 * @param {boolean} options.recipientsIncludeLists
 * @param {boolean} options.isDraft
 */
export function MessageFooter({
  dispatch,
  id,
  multipleRecipients,
  recipientsIncludeLists,
  isDraft,
}) {
  function onActionButtonClick(msg) {
    const payload = {
      id,
      shiftKey: msg.shiftKey,
    };
    let action = null;
    switch (msg.type) {
      case "draft":
        action = messageActions.editDraft(payload);
        break;
      case "reply":
      case "replyAll":
      case "replyList":
        action = messageActions.reply({ ...payload, type: msg.type });
        break;
      case "forward":
        action = messageActions.forward(payload);
        break;
      default:
        console.error("Don't know how to create an action for", msg);
    }
    dispatch(action);
  }

  return React.createElement(
    "div",
    { className: "messageFooter" },
    React.createElement(
      "div",
      { className: "footerActions" },
      isDraft &&
        React.createElement(ActionButton, {
          callback: onActionButtonClick,
          type: "draft",
        }),
      !isDraft &&
        React.createElement(ActionButton, {
          callback: onActionButtonClick,
          type: "reply",
        }),
      !isDraft &&
        multipleRecipients &&
        React.createElement(ActionButton, {
          callback: onActionButtonClick,
          type: "replyAll",
        }),
      !isDraft &&
        recipientsIncludeLists &&
        React.createElement(ActionButton, {
          callback: onActionButtonClick,
          type: "replyList",
        }),
      !isDraft &&
        React.createElement(ActionButton, {
          callback: onActionButtonClick,
          type: "forward",
        })
    )
  );
}
