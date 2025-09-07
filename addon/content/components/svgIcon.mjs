/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A basic SVG icon rendered using the `xlinkHref` ability
 * of SVGs. You can specify the full path, or just the hash.
 */
class SvgIcon extends HTMLElement {
  static observedAttributes = ["fullpath", "hash", "aria-hidden"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/conversation.css">
          <svg
            aria-hidden="false"
            class="icon"
            part="svg"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink">
            <use data-testid="use"></use>
          </svg>
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
    this.shadowRoot.appendChild(SvgIcon.fragment);
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
      case "fullpath": {
        this.shadowRoot
          .querySelector("use")
          .setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
            this.#getIconPath(newValue, this.getAttribute("hash"))
          );
        break;
      }
      case "hash": {
        this.shadowRoot
          .querySelector("use")
          .setAttributeNS(
            "http://www.w3.org/1999/xlink",
            "href",
            this.#getIconPath(this.getAttribute("fullPath"), newValue)
          );
        break;
      }
      case "aria-hidden": {
        this.shadowRoot
          .querySelector("svg")
          .setAttribute("aria-hidden", newValue);
        break;
      }
    }
  }

  #getIconPath(fullPath, hash) {
    return "icons/" + (fullPath || `material-icons.svg#${hash}`);
  }
}
customElements.define("svg-icon", SvgIcon);
