/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { summaryActions } from "../../reducer/reducerSummary.mjs";

/**
 * Handles the ConversationFooter layout.
 */
export class ConversationFooter extends HTMLElement {
  static observedAttributes = ["subject", "loading"];
  static dispatch;

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="conversation.css" />
          <div class="bottom-links">
            <a class="link forward"></a> - <a class="link print"></a>
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
    this.shadowRoot.appendChild(ConversationFooter.fragment);

    let forward = this.shadowRoot.querySelector(".forward");
    forward.textContent = browser.i18n.getMessage(
      "message.forwardConversation"
    );
    forward.addEventListener("click", () =>
      ConversationFooter.dispatch(summaryActions.forwardConversation())
    );

    let printElement = this.shadowRoot.querySelector(".print");
    printElement.textContent = browser.i18n.getMessage(
      "message.printConversation"
    );
    printElement.addEventListener("click", () =>
      ConversationFooter.dispatch(summaryActions.printConversation())
    );
  }
}
customElements.define("conversation-footer", ConversationFooter);
