/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Handles display for the footer of a message.
 */
export class MessageFooter extends HTMLElement {
  static observedAttributes = [
    "msgid",
    "is-draft",
    "multiple-recipients",
    "recipients-include-lists",
  ];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/message/messageFooter.css?v=1" />
          <div class="messageFooter">
            <div class="footerActions">
              <action-button type="draft" additionalclass="footerActions"></action-button>
              <action-button type="reply" additionalclass="footerActions"></action-button>
              <action-button type="replyAll" additionalclass="footerActions"></action-button>
              <action-button type="replyList" additionalclass="footerActions"></action-button>
              <action-button type="forward" additionalclass="footerActions"></action-button>
            </div>
          </div>
          </template>
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
    this.shadowRoot.appendChild(MessageFooter.fragment);
    let msgId = this.getAttribute("msgid");
    console.log("constructor", msgId);
    if (msgId) {
      this.updateMsgId(msgId);
    }
    this.updateButtons();
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    console.log(name, oldValue, newValue);
    if (name == "msgid") {
      this.updateMsgId(newValue);
      return;
    }

    this.updateButtons();
  }

  /**
   * Updates the msgId across the elements that need it.
   *
   * @param {string} msgId
   */
  updateMsgId(msgId) {
    for (let button of this.shadowRoot.querySelectorAll("action-button")) {
      button.setAttribute("msgid", msgId);
    }
  }

  /**
   * Updates the visibility of the buttons.
   */
  updateButtons() {
    let isDraft = this.hasAttribute("is-draft");
    let multipleRecipients = this.hasAttribute("multiple-recipients");
    let recipientsIncludeLists = this.hasAttribute("recipients-include-lists");

    let button = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("action-button[type='draft']")
    );
    button.style.display = isDraft ? "revert" : "none";

    button = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("action-button[type='reply']")
    );
    button.style.display = isDraft ? "none" : "revert";

    button = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("action-button[type='replyAll']")
    );
    button.style.display = isDraft || !multipleRecipients ? "none" : "revert";

    button = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("action-button[type='replyList']")
    );
    button.style.display =
      isDraft || !recipientsIncludeLists ? "none" : "revert";

    button = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("action-button[type='forward']")
    );
    button.style.display = isDraft ? "none" : "revert";
  }
}
customElements.define("message-footer", MessageFooter);
