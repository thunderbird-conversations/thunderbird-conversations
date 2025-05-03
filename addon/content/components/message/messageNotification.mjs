/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { messageActions } from "../../reducer/reducerMessages.mjs";
import { SvgIcon } from "../svgIcon.mjs";

/**
 * Handles display of the remote content notification.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {number} options.id
 * @param {string} options.realFrom
 */
function RemoteContentNotification({ dispatch, id, realFrom }) {
  function onShowRemote() {
    dispatch(messageActions.showRemoteContent({ id }));
  }

  function onAlwaysShowRemote() {
    dispatch(messageActions.alwaysShowRemoteContent({ id, realFrom }));
  }

  return React.createElement(
    "div",
    { className: "remoteContent notificationBar" },
    browser.i18n.getMessage("notification.remoteContentBlockedMsg") + " ",
    React.createElement(
      "span",
      { className: "show-remote-content" },
      React.createElement(
        "a",
        { className: "link", onClick: onShowRemote },

        browser.i18n.getMessage("notification.showRemote")
      ),
      " - "
    ),
    React.createElement(
      "span",
      { className: "always-display" },
      React.createElement(
        "a",
        { className: "link", onClick: onAlwaysShowRemote },

        browser.i18n.getMessage("notification.alwaysShowRemote", [realFrom])
      )
    )
  );
}

RemoteContentNotification.propTypes = {};

/**
 * A generic handler for single-button notifications.
 *
 * @param {object} options
 * @param {string} options.barClassName
 * @param {string} options.buttonClassName
 * @param {Function} options.onButtonClick
 * @param {string} options.buttonTitle
 * @param {string} options.iconName
 * @param {string} options.notificationText
 */
function GenericSingleButtonNotification({
  barClassName,
  buttonClassName,
  onButtonClick,
  buttonTitle,
  iconName,
  notificationText,
}) {
  return React.createElement(
    "div",
    { className: barClassName + " notificationBar" },
    React.createElement(SvgIcon, { hash: iconName }),
    notificationText + " ",
    React.createElement(
      "span",
      { className: buttonClassName },
      React.createElement("a", { onClick: onButtonClick }, buttonTitle)
    )
  );
}

/**
 * A generic handler for multiple button notifications.
 *
 * @param {object} options
 * @param {string} options.barClassName
 * @param {object[]} options.buttons
 * @param {Function} options.dispatch
 * @param {string} options.iconName
 * @param {number} options.id
 * @param {string} options.notificationText
 * @param {string} options.type
 */
function GenericMultiButtonNotification({
  barClassName,
  buttons,
  dispatch,
  iconName,
  id,
  notificationText,
  type,
}) {
  function onClick(actionParams) {
    dispatch(
      messageActions.notificationClick({
        id,
        notificationType: type,
        ...actionParams,
      })
    );
  }

  return React.createElement(
    "div",
    { className: barClassName + " notificationBar" },
    React.createElement(SvgIcon, { hash: iconName }),
    notificationText + " ",
    buttons.map((button, i) =>
      React.createElement(
        "button",
        {
          className: button.classNames,
          title: button.tooltiptext,
          key: i,
          onClick: onClick.bind(this, button.actionParams),
        },
        button.textContent
      )
    )
  );
}

/**
 * Handles display of the junk notification bar.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {number} options.id
 */
function JunkNotification({ dispatch, id }) {
  function onClick() {
    dispatch(messageActions.markAsJunk({ isJunk: false, id }));
  }

  return React.createElement(GenericSingleButtonNotification, {
    barClassName: "junkBar",
    buttonClassName: "notJunk",
    buttonTitle: browser.i18n.getMessage("notification.notJunk"),
    iconName: "whatshot",
    notificationText: browser.i18n.getMessage("notification.junkMsg"),
    onButtonClick: onClick,
  });
}

/**
 * Handles display of the outbox notification bar for sending unsent messages.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 */
function OutboxNotification({ dispatch }) {
  function onClick() {
    dispatch(messageActions.sendUnsent());
  }

  return React.createElement(GenericSingleButtonNotification, {
    barClassName: "outboxBar",
    buttonClassName: "sendUnsent",
    buttonTitle: browser.i18n.getMessage("notification.sendUnsent"),
    iconName: "inbox",
    notificationText: browser.i18n.getMessage("notification.isOutboxMsg"),
    onButtonClick: onClick,
  });
}

/**
 * Handles display of the phishing notification bar.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {number} options.id
 */
function PhishingNotification({ dispatch, id }) {
  function onClick() {
    dispatch(messageActions.ignorePhishing({ id }));
  }

  return React.createElement(GenericSingleButtonNotification, {
    barClassName: "phishingBar",
    buttonClassName: "ignore-warning",
    buttonTitle: browser.i18n.getMessage("notification.ignoreScamWarning"),
    iconName: "warning",
    notificationText: browser.i18n.getMessage("notification.scamMsg"),
    onButtonClick: onClick,
  });
}

/**
 * Handles display of message notification bars for a message.
 *
 * @param {object} options
 * @param {boolean} options.canUnJunk
 * @param {Function} options.dispatch
 * @param {object[]} options.extraNotifications
 * @param {boolean} options.hasRemoteContent
 * @param {boolean} options.isPhishing
 * @param {boolean} options.isOutbox
 * @param {number} options.id
 * @param {string} options.realFrom
 */
export function MessageNotification({
  canUnJunk,
  dispatch,
  extraNotifications,
  hasRemoteContent,
  isPhishing,
  isOutbox,
  id,
  realFrom,
}) {
  if (isPhishing) {
    return React.createElement(PhishingNotification, { dispatch, id });
  }
  if (hasRemoteContent) {
    return React.createElement(RemoteContentNotification, {
      dispatch,
      id,
      realFrom,
    });
  }
  if (canUnJunk) {
    return React.createElement(JunkNotification, { dispatch, id });
  }
  if (isOutbox) {
    return React.createElement(OutboxNotification, { dispatch });
  }
  if (extraNotifications && extraNotifications.length) {
    // Only display the first notification.
    const notification = extraNotifications[0];
    return React.createElement(GenericMultiButtonNotification, {
      barClassName: notification.type + "Bar",
      buttons: notification.buttons || [],
      iconName: notification.iconName,
      dispatch,
      id,
      notificationText: notification.label,
      type: notification.type,
    });
  }
  return null;
}
