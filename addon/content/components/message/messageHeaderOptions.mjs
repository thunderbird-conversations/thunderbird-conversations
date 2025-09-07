/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { ActionButton } from "./messageActionButton.mjs";
import { messageActions } from "../../reducer/reducerMessages.mjs";

/**
 * Handles display of the options menu.
 *
 * @param {object} props
 * @param {boolean} props.multipleRecipients
 * @param {boolean} props.recipientsIncludeLists
 * @param {(object, KeyboardEvent) => void} props.msgSendAction
 */
export function OptionsMoreMenu({
  multipleRecipients,
  recipientsIncludeLists,
  msgSendAction,
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
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "reply",
        })
      ),
      multipleRecipients &&
        React.createElement(
          "li",
          { className: "action-replyAll" },
          React.createElement(ActionButton, {
            callback: msgSendAction,
            className: "optionsButton",
            showString: true,
            type: "replyAll",
          })
        ),
      recipientsIncludeLists &&
        React.createElement(
          "li",
          { className: "action-replyList" },
          React.createElement(ActionButton, {
            callback: msgSendAction,
            className: "optionsButton",
            showString: true,
            type: "replyList",
          })
        ),
      React.createElement(
        "li",
        { className: "action-editNew" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "editAsNew",
        })
      ),
      React.createElement(
        "li",
        { className: "action-forward dropdown-sep" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "forward",
        })
      ),
      React.createElement(
        "li",
        { className: "action-archive" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "archive",
        })
      ),
      React.createElement(
        "li",
        { className: "action-delete" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "delete",
        })
      ),
      React.createElement(
        "li",
        { className: "action-classic" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
          type: "classic",
        })
      ),
      React.createElement(
        "li",
        { className: "action-source" },
        React.createElement(ActionButton, {
          callback: msgSendAction,
          className: "optionsButton",
          showString: true,
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
 * @param {boolean} props.overrideDarkMode
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
  overrideDarkMode,
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
  let prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  let [inDarkMode, setInDarkMode] = React.useState(prefersDarkQuery.matches);

  React.useEffect(() => {
    /**
     * @param {MediaQueryListEvent} event
     */
    function changeDarkMode(event) {
      setInDarkMode(event.matches);
      if (!event.matches && overrideDarkMode) {
        dispatch(messageActions.toggleOverrideDarkMode({ msgId: id }));
      }
    }

    prefersDarkQuery.addEventListener("change", changeDarkMode);

    return () => {
      prefersDarkQuery.removeEventListener("change", changeDarkMode);
    };
  }, [overrideDarkMode]);

  function replyAction(msg, event) {
    event.stopPropagation();
    event.preventDefault();

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
      case "editAsNew":
        action = messageActions.editAsNew(payload);
        break;
      case "archive":
        action = messageActions.archive({ id });
        break;
      case "delete":
        action = messageActions.delete({ id });
        break;
      case "classic":
        action = messageActions.openClassic(payload);
        break;
      case "source":
        action = messageActions.openSource(payload);
        break;
      default:
        console.error("Don't know how to create an action for", msg);
    }
    dispatch(action);
  }

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
      document.addEventListener("click", clickOrBlurListener);
      document.addEventListener("keypress", keyListener);
      document.addEventListener("blur", clickOrBlurListener);
    }
    return () => {
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

  function toggleDarkMode(event) {
    event.preventDefault();
    event.stopPropagation();
    dispatch(messageActions.toggleOverrideDarkMode({ msgId: id }));
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
        React.createElement(ActionButton, {
          callback: replyAction,
          className: "icon-link",
          type: actionButtonType,
        })
      ),
    expanded &&
      inDarkMode &&
      React.createElement(
        "span",
        {
          className: "invert-colors",
        },
        React.createElement(
          "button",
          {
            className: "icon-link",
            onClick: toggleDarkMode,
            title: browser.i18n.getMessage(
              overrideDarkMode
                ? "message.turnDarkModeOn.tooltip"
                : "message.turnDarkModeOff.tooltip"
            ),
          },
          React.createElement("svg-icon", {
            "aria-hidden": true,
            hash: overrideDarkMode ? "invert_colors_off" : "invert_colors",
          })
        )
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
            className: "icon-link top-right-more",
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
            msgSendAction: replyAction,
            multipleRecipients,
          })
      )
  );
}
