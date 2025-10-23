/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { messageActions } from "../../reducer/reducerMessages.mjs";

/**
 * Handles display of the options menu.
 *
 * @param {object} props
 * @param {boolean} props.multipleRecipients
 * @param {number} props.msgId
 * @param {boolean} props.recipientsIncludeLists
 */
export function OptionsMoreMenu({
  multipleRecipients,
  msgId,
  recipientsIncludeLists,
}) {
  return React.createElement(
    "div",
    { className: "tooltip tooltip-menu menu" },
    React.createElement("div", { className: "arrow" }),
    React.createElement("div", { className: "arrow inside" }),
    React.createElement(
      "ul",
      null,
      React.createElement(
        "li",
        { className: "action-reply" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "reply",
        })
      ),
      multipleRecipients &&
        React.createElement(
          "li",
          { className: "action-replyAll" },
          React.createElement("action-button", {
            msgId,
            additionalclass: "dropDown",
            showString: "true",
            type: "replyAll",
          })
        ),
      recipientsIncludeLists &&
        React.createElement(
          "li",
          { className: "action-replyList" },
          React.createElement("action-button", {
            msgId,
            additionalclass: "dropDown",
            showString: "true",
            type: "replyList",
          })
        ),
      React.createElement(
        "li",
        { className: "action-editNew" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "editAsNew",
        })
      ),
      React.createElement(
        "li",
        { className: "action-forward dropdown-sep" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "forward",
        })
      ),
      React.createElement(
        "li",
        { className: "action-archive" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "archive",
        })
      ),
      React.createElement(
        "li",
        { className: "action-delete" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "delete",
        })
      ),
      React.createElement(
        "li",
        { className: "action-classic" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "classic",
        })
      ),
      React.createElement(
        "li",
        { className: "action-source" },
        React.createElement("action-button", {
          msgId,
          additionalclass: "dropDown",
          showString: "true",
          type: "source",
        })
      )
    )
  );
}

/**
 * Handles display of options in the message header.
 *
 * @param {object} props
 * @param {Function} props.dispatch
 * @param {string} props.date
 * @param {boolean} props.detailsShowing
 * @param {boolean} props.expanded
 * @param {string} props.fullDate
 * @param {number} props.id
 * @param {object[]} props.attachments
 * @param {boolean} props.multipleRecipients
 * @param {boolean} props.recipientsIncludeLists
 * @param {boolean} props.isDraft
 */
export function MessageHeaderOptions({
  dispatch,
  date,
  detailsShowing,
  expanded,
  fullDate,
  id,
  attachments,
  multipleRecipients,
  recipientsIncludeLists,
  isDraft,
}) {
  let [displayMenu, setDisplayMenu] = React.useState(false);

  function showDetails(event) {
    event.preventDefault();
    event.stopPropagation();
    dispatch(
      messageActions.showMsgDetails({
        id,
        detailsShowing: !detailsShowing,
      })
    );
  }

  React.useEffect(() => {
    function clickOrBlurListener() {
      clearMenu();
    }
    function keyListener(event) {
      if (event.key == "Escape") {
        clearMenu();
      }
    }

    if (displayMenu) {
      document.addEventListener("button-clicked", clickOrBlurListener);
      document.addEventListener("click", clickOrBlurListener);
      document.addEventListener("keypress", keyListener);
      document.addEventListener("blur", clickOrBlurListener);
    }
    return () => {
      document.removeEventListener("button-clicked", clickOrBlurListener);
      document.removeEventListener("click", clickOrBlurListener);
      document.removeEventListener("keypress", keyListener);
      document.removeEventListener("blur", clickOrBlurListener);
    };
  }, [displayMenu]);

  function handleDisplayMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setDisplayMenu(!displayMenu);
  }

  function clearMenu() {
    setDisplayMenu(false);
  }

  let actionButtonType = "reply";
  if (isDraft) {
    actionButtonType = "draft";
  } else if (recipientsIncludeLists) {
    actionButtonType = "replyList";
  } else if (multipleRecipients) {
    actionButtonType = "replyAll";
  }

  return React.createElement(
    "div",
    { className: "options" },
    !!attachments.length &&
      React.createElement(
        "span",
        { className: "attachmentIcon" },
        React.createElement("svg-icon", { hash: "attachment" })
      ),
    React.createElement(
      "span",
      { className: "date" },
      React.createElement("span", { title: fullDate }, date)
    ),
    expanded &&
      React.createElement(
        "span",
        { className: "mainActionButton" },
        React.createElement("action-button", {
          type: actionButtonType,
          additionalclass: "header",
          msgId: id,
        })
      ),
    expanded &&
      React.createElement(
        "span",
        {
          className: "details-hidden",
        },
        React.createElement(
          "button",
          {
            className: "icon-link",
            onClick: showDetails,
            title: browser.i18n.getMessage(
              detailsShowing
                ? "message.hideDetails.tooltip"
                : "message.showDetails.tooltip"
            ),
          },
          React.createElement("svg-icon", {
            "aria-hidden": true,
            hash: detailsShowing ? "info" : "info_outline",
          })
        )
      ),
    expanded &&
      React.createElement(
        "span",
        { className: "dropDown" },
        React.createElement(
          "button",
          {
            onClick: handleDisplayMenu,
            className: "icon-link",
            title: browser.i18n.getMessage("message.moreMenu.tooltip"),
          },
          React.createElement("svg-icon", {
            "aria-hidden": true,
            hash: "more_vert",
          })
        ),
        displayMenu &&
          React.createElement(OptionsMoreMenu, {
            recipientsIncludeLists,
            msgId: id,
            multipleRecipients,
          })
      )
  );
}
