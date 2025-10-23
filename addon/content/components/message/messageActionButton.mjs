/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { messageUtils } from "../../reducer/messageUtils.mjs";

const ActionsToInfoMap = {
  draft: {
    title: "action.editDraft",
    icon: "edit",
  },
  editAsNew: {
    title: "action.editNew",
    icon: "edit",
  },
  reply: {
    title: "action.reply",
    icon: "reply",
  },
  replyAll: {
    title: "action.replyAll",
    icon: "reply_all",
  },
  replyList: {
    title: "action.replyList",
    icon: "list",
  },
  forward: {
    title: "action.forward",
    icon: "forward",
  },
  archive: {
    title: "action.archive",
    icon: "archive",
  },
  delete: {
    title: "action.delete",
    icon: "delete",
  },
  classic: {
    title: "action.viewClassic",
    icon: "open_in_new",
  },
  source: {
    title: "action.viewSource",
    icon: "code",
  },
  deleteAttachment: {
    title: "attachments.context.delete",
    icon: "delete_forever",
  },
  detachAttachment: {
    title: "attachments.context.detach",
    icon: "save_alt",
  },
};

/**
 * @typedef callbackParams
 * @property {object} args
 * @property {string} args.type
 * @property {boolean} args.shiftKey
 */

/**
 * Defines an action button.
 */
export class ActionButton extends HTMLElement {
  static observedAttributes = ["type", "showstring", "additionalclass"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template><link rel="stylesheet" href="../content/components/message/messageActionButton.css?v=4" />
          <button>
            <svg-icon aria-hidden="true"></svg-icon>
          </button></template>
        `,
        "text/html"
      );
      this._template = document.importNode(doc.querySelector("template"), true);
    }
    return this._template.content.cloneNode(true);
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(ActionButton.fragment);
    this.shadowRoot
      .querySelector("button")
      .addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        this.handleActivation(event);
        // Not an ideal way, but it works for now.
        this.dispatchEvent(new CustomEvent("button-clicked"));
      });
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "type": {
        const info = ActionsToInfoMap[newValue];
        this.shadowRoot
          .querySelector("svg-icon")
          .setAttribute("hash", info.icon);

        let button = this.shadowRoot.querySelector("button");
        let msg = browser.i18n.getMessage(info.title);
        if (this.getAttribute("showstring")) {
          button.appendChild(document.createTextNode(msg));
        } else {
          button.setAttribute("title", msg);
        }
        break;
      }
      case "additionalclass": {
        this.shadowRoot.querySelector("button").classList.add(newValue);
      }
    }
  }

  /**
   * Handles the button being clicked or selected.
   *
   * @param {MouseEvent|KeyboardEvent} event
   */
  handleActivation(event) {
    let msgId = Number(this.getAttribute("msgId"));
    let shiftKey = event && event.shiftKey;
    let type = this.getAttribute("type");
    switch (type) {
      case "draft":
        browser.conversations.beginEdit(msgId).catch(console.error);
        break;
      case "reply":
      case "replyAll":
      case "replyList":
        messageUtils.replyMessage(msgId, shiftKey, type).catch(console.error);
        break;
      case "forward":
        messageUtils.forwardMessage(msgId, shiftKey).catch(console.error);
        break;
      case "editAsNew":
        messageUtils.editAsNew(msgId, shiftKey).catch(console.error);
        break;
      case "archive":
        browser.messages.archive([msgId]).catch(console.error);
        break;
      case "delete":
        browser.messages.delete([msgId]).catch(console.error);
        break;
      case "classic":
        browser.messageDisplay.open({ messageId: msgId }).catch(console.error);
        break;
      case "source":
        browser.conversations.openInSourceView(msgId).catch(console.error);
        break;
      case "detachAttachment":
        messageUtils
          .detachAttachment({
            msgId,
            partName: this.getAttribute("partName"),
            shouldSave: true,
          })
          .catch(console.error);
        break;
      case "deleteAttachment":
        messageUtils
          .detachAttachment({
            msgId,
            partName: this.getAttribute("partName"),
            shouldSave: false,
            fileName: this.getAttribute("fileName"),
          })
          .catch(console.error);
        break;
      default:
        console.error("Don't know how to create an action for", type, msgId);
    }
  }
}
customElements.define("action-button", ActionButton);
