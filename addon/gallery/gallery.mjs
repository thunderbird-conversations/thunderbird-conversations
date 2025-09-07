/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @typedef PhotoProps
 * @property {number} index
 * @property {number} total
 * @property {string} name
 * @property {string} size
 * @property {string} [src]
 */

/**
 * Photo class for displaying pictures.
 */
class Photo extends HTMLElement {
  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="style.css" />
          <div class="photoWrap">
            <img>
            <div class="informationline">
              <div class="filename"></div>
              <div class="size"></div>
              <div class="count"></div>
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
    this.shadowRoot.appendChild(Photo.fragment);
  }

  /**
   * Sets the properties of this picture.
   *
   * @param {PhotoProps} properties
   */
  setProps(properties) {
    this.shadowRoot.querySelector(".photoWrap").id = "photo" + properties.index;
    this.shadowRoot.querySelector("img").src = properties.src;
    this.shadowRoot.querySelector(".filename").textContent = properties.name;
    this.shadowRoot.querySelector(".size").textContent = properties.size;
    this.shadowRoot.querySelector(".count").textContent =
      properties.index + " / " + properties.total;
  }
}
customElements.define("photo-element", Photo);

/**
 * Handles display of the gallery views.
 */
class Gallery extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    let params = new URLSearchParams(document.location.search);
    let uri = params.get("msgUri");
    let scrollToPartName = params.get("partName");
    this.load(uri, scrollToPartName).catch(console.error);
  }

  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   *
   * @param {string} uri
   * @param {string} scrollToPartName
   */
  async load(uri, scrollToPartName) {
    const id = await browser.conversations.getMessageIdForUri(uri);
    if (!id) {
      // TODO: Render this in react.
      document.getElementById("gallery").textContent = browser.i18n.getMessage(
        "gallery.messageMovedOrDeleted"
      );
      return;
    }
    const header = await browser.messages.get(id);
    document.title = browser.i18n.getMessage("gallery.title", [header.subject]);

    let attachments = await browser.messages.listAttachments(id);

    attachments = attachments.filter(
      (p) => p.contentType.indexOf("image/") == 0
    );

    await this.output(attachments, id, scrollToPartName);
  }

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the handlebars template and then appends the result to the root
   *  DOM node.
   *
   * @param {browser.messages.MessageAttachment[]} attachments
   * @param {number} id
   * @param {string} scrollToPartName
   */
  async output(attachments, id, scrollToPartName) {
    let scrollToElement;
    // Get the initial data first.
    for (const [i, attachment] of attachments.entries()) {
      let photo = /** @type {Photo} */ (
        document.createElement("photo-element")
      );

      let file = await browser.messages.getAttachmentFile(
        id,
        attachment.partName
      );
      photo.setProps({
        index: i + 1,
        total: attachments.length,
        name: attachment.name,
        size: await browser.messengerUtilities.formatFileSize(attachment.size),
        src: URL.createObjectURL(file),
      });

      if (scrollToPartName && attachment.partName == scrollToPartName) {
        scrollToElement = photo;
      }

      this.shadowRoot.appendChild(photo);
    }

    if (scrollToElement) {
      setTimeout(
        () => scrollToElement.scrollIntoView({ behavior: "smooth" }),
        100
      );
    }
  }
}
customElements.define("gallery-element", Gallery);
