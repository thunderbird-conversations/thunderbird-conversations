/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";

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
  id,
  multipleRecipients,
  recipientsIncludeLists,
  isDraft,
}) {
  return React.createElement(
    "div",
    { className: "messageFooter" },
    React.createElement(
      "div",
      { className: "footerActions" },
      isDraft &&
        React.createElement("action-button", {
          additionalclass: "footerActions",
          type: "draft",
          msgId: id,
        }),
      !isDraft &&
        React.createElement("action-button", {
          additionalclass: "footerActions",
          type: "reply",
          msgId: id,
        }),
      !isDraft &&
        multipleRecipients &&
        React.createElement("action-button", {
          additionalclass: "footerActions",
          type: "replyAll",
          msgId: id,
        }),
      !isDraft &&
        recipientsIncludeLists &&
        React.createElement("action-button", {
          additionalclass: "footerActions",
          type: "replyList",
          msgId: id,
        }),
      !isDraft &&
        React.createElement("action-button", {
          additionalclass: "footerActions",
          type: "forward",
          msgId: id,
        })
    )
  );
}
