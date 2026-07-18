/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @import {TextBoxRenderer, TextAreaRenderer} from "./composeFields.mjs"
 */

/**
 * Handles layout and control of the compose widget.
 */
class ComposeWidget extends HTMLElement {
  static observedAttributes = ["from"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/compose/composeWidget.css?v=1" />
          <div class="from">
            <span></span>
          </div>
          <text-box class="to"></text-box>
          <text-box class="subject"></text-box>
          <text-area class="body"></text-area>
          <div class="sendStatus"></div>
          <div class="buttons">
            <button class="discard">
              <svg-icon aria-hidden="true" hash="delete_forever"></svg-icon>
            </button>
            <button class="send">
              <svg-icon aria-hidden="true" hash="send"></svg-icon>
            </button>
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
  }

  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(ComposeWidget.fragment);
    this.shadowRoot
      .querySelector(".from")
      .insertBefore(
        document.createTextNode(
          browser.i18n.getMessage("message.fromHeader") + " "
        ),
        this.shadowRoot.querySelector(".from > span")
      );

    let sendBtn = this.shadowRoot.querySelector(".send");

    sendBtn.appendChild(
      document.createTextNode(browser.i18n.getMessage("compose.send"))
    );
    sendBtn.addEventListener("click", () => {
      this.#sendMsg().catch(console.error);
    });
    let sendStatus = /** @type {HTMLDivElement} */ (
      this.shadowRoot.querySelector(".sendStatus")
    );
    sendStatus.style.display = "none";

    let discardBtn = this.shadowRoot.querySelector(".discard");
    discardBtn.appendChild(
      document.createTextNode(browser.i18n.getMessage("compose.discard"))
    );

    discardBtn.addEventListener("click", async (event) => {
      if (this.hasAttribute("inline")) {
        document.dispatchEvent(new CustomEvent("quick-reply-finished"));
        return;
      }
      // We have to tell the API to close the tab, as `window.close` for some
      // reason triggers the unload handler twice.
      let currentTab = await browser.tabs.getCurrent();
      setTimeout(() => browser.tabs.remove(currentTab.id), 0);
    });

    let from = this.getAttribute("from");
    if (from) {
      this.shadowRoot.querySelector(".from > span").textContent = from;
    }

    this.checkBeforeUnload = this.checkBeforeUnload.bind(this);

    window.addEventListener("beforeunload", this.checkBeforeUnload);

    // Only set these in the connected, as we don't want to check
    // text box values as we go.
    let toBox = /** @type {TextBoxRenderer} */ (
      this.shadowRoot.querySelector(".to")
    );
    toBox.title = "message.toHeader";
    toBox.setAttribute("initialvalue", this.getAttribute("to") ?? "");

    let subjectBox = /** @type {TextBoxRenderer} */ (
      this.shadowRoot.querySelector(".subject")
    );
    subjectBox.title = "compose.fieldSubject";
    subjectBox.setAttribute("initialvalue", this.getAttribute("subject") ?? "");
    subjectBox.style.display = this.hasAttribute("hideSubject")
      ? "none"
      : "revert";

    let body = /** @type {TextAreaRenderer} */ (
      this.shadowRoot.querySelector(".body")
    );
    body.setAttribute("initialvalue", this.getAttribute("body") ?? "");

    if (this.hasAttribute("replyOnTop")) {
      let textarea = body.shadowRoot.querySelector("textarea");
      switch (Number(this.getAttribute("replyOnTop"))) {
        case 0: {
          let textLength = body.value.length;
          textarea.setSelectionRange(textLength, textLength);
          break;
        }
        case 1: {
          textarea.setSelectionRange(0, 0);
          break;
        }
        case 2: {
          let textLength = body.value.length;
          textarea.setSelectionRange(0, textLength);
          break;
        }
      }
    }
    setTimeout(() => {
      if (!body.shadowRoot) {
        return;
      }
      if (body.value) {
        body.shadowRoot.querySelector("textarea").focus();
      } else {
        toBox.shadowRoot.querySelector("input").focus();
      }
    }, 10);
  }

  connectedMoveCallback() {}

  disconnectedCallback() {
    window.removeEventListener("beforeunload", this.checkBeforeUnload);
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.shadowRoot) {
      return;
    }

    if (name == "from") {
      this.shadowRoot.querySelector(".from > span").textContent = newValue;
    }
  }

  #getValues() {
    let inReplyTo = this.getAttribute("inReplyTo");
    return {
      from: this.getAttribute("identityId"),
      to: /** @type {TextBoxRenderer} */ (this.shadowRoot.querySelector(".to"))
        .value,
      subject: /** @type {TextBoxRenderer} */ (
        this.shadowRoot.querySelector(".subject")
      ).value,
      body:
        /** @type {TextAreaRenderer} */ (this.shadowRoot.querySelector(".body"))
          .value ?? "",
      originalMsgId: inReplyTo ? Number(inReplyTo) : undefined,
    };
  }

  /**
   * Checks if the form has been modified, and prevents unloading if necessary.
   *
   * @param {Event} event
   */
  checkBeforeUnload(event) {
    let values = this.#getValues();
    if (
      values.to != (this.getAttribute("to") ?? "") ||
      (!this.hasAttribute("hideSubject") &&
        values.subject != (this.getAttribute("subject") ?? "")) ||
      values.body != (this.getAttribute("body") ?? "")
    ) {
      event.preventDefault();
    }
  }

  async #sendMsg() {
    let sendStatus = /** @type {HTMLDivElement} */ (
      this.shadowRoot.querySelector(".sendStatus")
    );
    sendStatus.textContent = browser.i18n.getMessage("compose.sendingMessage");
    sendStatus.style.display = "revert";
    let success = true;
    try {
      await browser.convCompose.send(this.#getValues());
    } catch (ex) {
      console.error(ex);
      success = false;
    }
    if (success) {
      sendStatus.style.display = "none";
    } else {
      sendStatus.textContent = browser.i18n.getMessage(
        "compose.couldntSendTheMessage"
      );
    }

    if (success) {
      if (this.hasAttribute("inline")) {
        document.dispatchEvent(new CustomEvent("quick-reply-finished"));
      } else {
        window.close();
      }
    }
  }
}
customElements.define("compose-widget", ComposeWidget);
