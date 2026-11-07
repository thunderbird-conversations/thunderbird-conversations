/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { messageActions } from "../../reducer/reducerMessages.mjs";
import { SvgIcon } from "../svgIcon.mjs";
import { messageUtils } from "../../reducer/messageUtils.mjs";

/**
 * A generic handler for notifications.
 */
class GenericNotification extends HTMLElement {
  static observedAttributes = ["msgid"];

  connectedCallback() {
    this.connected = true;
    this.attachShadow({ mode: "open" });

    let css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "../content/components/message/messageNotification.css";
    this.shadowRoot.appendChild(css);

    let wrapper = document.createElement("div");
    wrapper.classList.add("notificationBar");

    this.#icon = /** @type {SvgIcon} */ (document.createElement("svg-icon"));
    wrapper.appendChild(this.#icon);

    this.#notificationTextNode = document.createTextNode("");
    wrapper.appendChild(this.#notificationTextNode);
    wrapper.appendChild(document.createTextNode(" "));

    this.#buttonWrapper = document.createElement("span");
    this.#buttonWrapper.className = "button-wrapper";
    wrapper.appendChild(this.#buttonWrapper);

    this.#wrapper = wrapper;
    this.#applyProperties();

    this.shadowRoot.appendChild(wrapper);

    if (this.hasAttribute("msgid")) {
      this.#applyProperties();
    }
  }

  disconnectedCallback() {
    this.connected = false;
    this.#notificationTextNode = null;
    this.#buttonWrapper = null;
    this.#icon = null;
  }

  /**
   * @typedef {object} NotificationButton
   * @property {"a" | "button"} type
   * @property {string} id
   * @property {string} title
   */

  /**
   * @typedef {object} NotificationProperties
   * @property {string} className
   * @property {string} notificationText
   * @property {string} iconName
   * @property {NotificationButton[]} buttons
   * @property {(event: Event) => void} listener
   */

  /**
   * Gets the properties for this notification.
   *
   * @returns {?NotificationProperties}
   */
  getProperties() {
    return null;
  }

  #applyProperties() {
    let properties = this.getProperties();
    let { className, notificationText, iconName, buttons, listener } =
      properties;
    this.#wrapper.classList.value = "notificationBar " + className;
    this.#notificationTextNode.textContent = notificationText;
    this.#icon.setAttribute("hash", iconName);

    while (this.#buttonWrapper.firstChild) {
      this.#buttonWrapper.lastChild.remove();
    }
    for (let [i, { type, id, title }] of buttons.entries()) {
      let button = document.createElement(type);
      button.setAttribute("id", id);
      if (type == "a") {
        button.appendChild(document.createTextNode(title));
      } else {
        button.title = title;
      }
      button.addEventListener("click", listener);

      this.#buttonWrapper.appendChild(button);
      if (i < buttons.length - 1) {
        this.#buttonWrapper.appendChild(document.createTextNode(" - "));
      }
    }
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.connected) {
      return;
    }
    this.#applyProperties();
  }

  /** @type {?HTMLDivElement} */
  #wrapper = null;
  /** @type {?SvgIcon} */
  #icon = null;
  /** @type {?HTMLSpanElement} */
  #buttonWrapper = null;
  /** @type {?Text} */
  #notificationTextNode = null;
  connected = false;
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
    React.createElement("svg-icon", { hash: iconName }),
    notificationText + " ",
    buttons.map((button, i) =>
      React.createElement(
        "button",
        {
          // @ts-ignore
          className: button.classNames,
          title: button.tooltiptext,
          key: i,
          // @ts-ignore
          onClick: onClick.bind(this, button.actionParams),
        },
        button.textContent
      )
    )
  );
}

/**
 * Handles display of the junk notification bar.
 */
class JunkNotification extends GenericNotification {
  getProperties() {
    return {
      className: "junkBar",
      notificationText: browser.i18n.getMessage("notification.junkMsg"),
      iconName: "whatshot",
      buttons: [
        {
          type: /** @type {"a"|"button"} */ ("a"),
          id: "notJunk",
          title: browser.i18n.getMessage("notification.notJunk"),
        },
      ],
      listener: () =>
        messageUtils.store.dispatch(
          messageActions.markAsJunk({
            isJunk: false,
            id: this.getAttribute("msgid"),
          })
        ),
    };
  }
}
customElements.define("junk-notification", JunkNotification);

/**
 * Handles display of the outbox notification bar.
 */
class OutboxNotification extends GenericNotification {
  getProperties() {
    return {
      className: "outboxBar",
      notificationText: browser.i18n.getMessage("notification.isOutboxMsg"),
      iconName: "inbox",
      buttons: [
        {
          type: /** @type {"a"|"button"} */ ("a"),
          id: "sendUnsent",
          title: browser.i18n.getMessage("notification.sendUnsent"),
        },
      ],
      listener: () => messageUtils.store.dispatch(messageActions.sendUnsent()),
    };
  }
}
customElements.define("outbox-notification", OutboxNotification);

/**
 * Handles display of the outbox notification bar.
 */
class PhishingNotification extends GenericNotification {
  getProperties() {
    return {
      className: "phishingBar",
      notificationText: browser.i18n.getMessage("notification.scamMsg"),
      iconName: "warning",
      buttons: [
        {
          type: /** @type {"a"|"button"} */ ("a"),
          id: "ignoreWarning",
          title: browser.i18n.getMessage("notification.ignoreScamWarning"),
        },
      ],
      /** @type {(event: Event) => void} */
      listener: (event) => {
        messageUtils.store.dispatch(
          messageActions.ignorePhishing({
            id: /** @type {PhishingNotification} */ (event.target).getAttribute(
              "msgid"
            ),
          })
        );
      },
    };
  }
}
customElements.define("phishing-notification", PhishingNotification);

/**
 * Handles display of the remote content notification.
 */
class RemoteContentNotification extends GenericNotification {
  getProperties() {
    /** @type {number} */
    let msgId;
    try {
      msgId = parseInt(this.getAttribute("msgid"));
    } catch {
      return null;
    }

    let message = messageUtils.store
      .getState()
      .messages.msgData.find((msg) => msg.id == msgId);
    if (!message) {
      return null;
    }
    let realFrom = message?.realFrom;

    return {
      className: "remoteContent",
      notificationText: browser.i18n.getMessage(
        "notification.remoteContentBlockedMsg"
      ),
      iconName: "cloud_download",
      buttons: [
        {
          type: /** @type {"a"|"button"} */ ("a"),
          id: "showRemote",
          title: browser.i18n.getMessage("notification.showRemote"),
        },
        {
          type: /** @type {"a"|"button"} */ ("a"),
          id: "alwaysShowRemote",
          title: browser.i18n.getMessage("notification.alwaysShowRemote", [
            realFrom,
          ]),
        },
      ],
      /** @type {(event: Event) => void} */
      listener: (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }
        let targetId = event.target.getAttribute("id");
        if (targetId == "showRemote") {
          messageUtils.store.dispatch(
            messageActions.showRemoteContent({ msgId })
          );
        } else {
          messageUtils.store.dispatch(
            messageActions.alwaysShowRemoteContent({ msgId, realFrom })
          );
        }
      },
    };
  }
}
customElements.define("remote-content-notification", RemoteContentNotification);

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
 * @param {number} options.msgid
 * @param {string} options.realFrom
 */
export function MessageNotification({
  canUnJunk,
  dispatch,
  extraNotifications,
  hasRemoteContent,
  isPhishing,
  isOutbox,
  msgid,
  realFrom,
}) {
  if (isPhishing) {
    return React.createElement("phishing-notification", { msgid });
  }
  if (hasRemoteContent) {
    return React.createElement("remote-content-notification", {
      msgid,
      realFrom,
    });
  }
  if (canUnJunk) {
    return React.createElement("junk-notification", { msgid });
  }
  if (isOutbox) {
    return React.createElement("outbox-notification", { msgid });
  }
  if (extraNotifications && extraNotifications.length) {
    // Only display the first notification.
    const notification = extraNotifications[0];
    return React.createElement(GenericMultiButtonNotification, {
      barClassName: notification.type + "Bar",
      buttons: notification.buttons || [],
      iconName: notification.iconName,
      dispatch,
      id: msgid,
      notificationText: notification.label,
      type: notification.type,
    });
  }
  return null;
}
