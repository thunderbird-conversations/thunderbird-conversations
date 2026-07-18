/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A renderer for a text box.
 */
export class TextBoxRenderer extends HTMLElement {
  static observedAttributes = ["disabled", "initialvalue", "title"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/compose/composeFields.css?v=1" />
          <div class="headerField">
            <label></label>
            <div class="headerEntry">
              <input type="text" />
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
  }

  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(TextBoxRenderer.fragment);
    this.setup();
  }

  connectedMoveCallback() {}

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
    this.setup();
  }

  setup() {
    let title = this.getAttribute("title");
    if (title) {
      this.shadowRoot.querySelector("label").textContent =
        browser.i18n.getMessage(title);
    }
    let disabled = this.getAttribute("disabled");
    if (disabled) {
      /** @type {HTMLInputElement} */ (
        this.shadowRoot.querySelector("input")
      ).disabled = !!disabled;
    }

    this.shadowRoot.querySelector("input").value =
      this.getAttribute("initialvalue") ?? "";
  }

  get value() {
    return this.shadowRoot.querySelector("input").value;
  }
}
customElements.define("text-box", TextBoxRenderer);

/**
 * Renderer for a text area.
 */
export class TextAreaRenderer extends HTMLElement {
  static observedAttributes = ["initialvalue"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/compose/composeFields.css?v=1" />
          <div class="textAreaWrapper">
            <textarea></textarea>
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
  }

  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(TextAreaRenderer.fragment);

    this.shadowRoot.querySelector("textarea").value =
      this.getAttribute("initialvalue") ?? "";
  }

  connectedMoveCallback() {}

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
    this.shadowRoot.querySelector("textarea").value =
      this.getAttribute("initialvalue") ?? "";
  }

  get value() {
    return this.shadowRoot.querySelector("textarea").value;
  }
}
customElements.define("text-area", TextAreaRenderer);
