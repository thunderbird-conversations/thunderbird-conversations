/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { attachmentActions } from "../../reducer/reducerAttachments.mjs";
import { messageUtils } from "../../reducer/messageUtils.mjs";

/**
 * @typedef {import("../../reducer/messageEnricher.mjs").MsgAttachment} MsgAttachment
 */

const ICON_MAPPING = new Map([
  ["application/msword", "x-office-document"],
  ["application/vnd.ms-excel", "x-office-spreadsheet"],
  ["application/vnd.ms-powerpoint", "x-office-presentation"],
  ["application/rtf", "x-office-document"],
  ["application/zip", "package-x-generic"],
  ["application/bzip2", "package-x-generic"],
  ["application/x-gzip", "package-x-generic"],
  ["application/x-tar", "package-x-generic"],
  ["application/x-compressed", "package-x-generic"],
  // "message/": "email",
  ["text/x-vcalendar", "x-office-calendar"],
  ["text/x-vcard", "x-office-address-book"],
  ["text/html", "text-html"],
  ["application/pdf", "application-pdf"],
  ["application/x-pdf", "application-pdf"],
  ["application/x-bzpdf", "application-pdf"],
  ["application/x-gzpdf", "application-pdf"],
]);

const FALLBACK_ICON_MAPPING = new Map([
  // Fallbacks, at the end.
  ["video/", "video-x-generic"],
  ["audio/", "audio-x-generic"],
  ["image/", "image-x-generic"],
  ["text/", "text-x-generic"],
]);

/**
 * The more menu for attachments
 */
class AttachmentMoreMenu extends HTMLElement {
  static observedAttributes = ["msgid", "filename", "partname"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/message/tooltip.css?v=1" />
          <link rel="stylesheet" href="../content/components/message/attachments.css?v=1" />
          <div>
            <div class="arrow"></div>
            <div class="arrow inside"></div>
            <ul>
              <li class="action-detach">
                <action-button
                  showstring="true"
                  type="detachAttachment"
                  additionalclass="dropDown">
                </action-button>
              </li>
              <li class="action-delete">
                <action-button
                  showstring="true"
                  type="deleteAttachment"
                  additionalclass="dropDown">
                </action-button>
              </li>
            </ul>
          </div>
        </template>
        `,
        "text/html"
      );
      this._template = document.importNode(doc.querySelector("template"), true);
    }
    return this._template.content.cloneNode(true);
  }

  connectedCallback() {
    this.#connected = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(AttachmentMoreMenu.fragment);

    for (let attr of AttachmentMoreMenu.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
  }

  disconnectedCallback() {
    this.#connected = false;
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#connected) {
      return;
    }
    let detachButton = this.shadowRoot.querySelector(
      ".action-detach > action-button"
    );
    let deleteButton = this.shadowRoot.querySelector(
      ".action-delete > action-button"
    );
    switch (name) {
      case "msgid": {
        detachButton.setAttribute("msgid", newValue);
        deleteButton.setAttribute("msgid", newValue);
        break;
      }
      case "filename": {
        detachButton.setAttribute("filename", newValue);
        deleteButton.setAttribute("filename", newValue);
        break;
      }
      case "partname": {
        detachButton.setAttribute("partname", newValue);
        deleteButton.setAttribute("partname", newValue);
        break;
      }
    }
  }

  #connected = false;
}
customElements.define("attachment-more-menu", AttachmentMoreMenu);

/**
 * Handles display of an individual attachment.
 */
class Attachment extends HTMLElement {
  static observedAttributes = ["details"];

  static get fragment() {
    if (!this.#template) {
      let parser = new DOMParser();

      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/message/tooltip.css?v=1" />
          <link rel="stylesheet" href="../content/components/message/iconLinks.css?v=1" />
          <link rel="stylesheet" href="../content/components/message/attachments.css?v=1" />
          <div class="attachmentWrapper">
            <div class="attachmentThumb" draggable="false">
              <img></img>
            </div>
            <div class="attachmentInfo align">
              <span class="filename"></span>
              <span class="filesize"></span>
              <div class="attachActions" hidden>
                <a class="icon-link preview-attachment" hidden>
                  <svg-icon hash="visibility"></svg-icon>
                </a>
                <a class="icon-link download-attachment">
                  <svg-icon hash="file_download"></svg-icon>
                </a>
                <a class="icon-link open-attachment">
                  <svg-icon hash="search"></svg-icon>
                </a>
                <span class="attachmentsDropDown">
                  <a class="icon-link more-attachment">
                    <svg-icon hash="more_vert"></svg-icon>
                  </a>
                  <attachment-more-menu class="tooltip hidden"></attachment-more-menu>
                </span>
              </div>
            </div>
          </div>
        </template>
        `,
        "text/html"
      );
      this.#template = document.importNode(doc.querySelector("template"), true);
    }
    return this.#template.content.cloneNode(true);
  }

  connectedCallback() {
    this.#connected = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(Attachment.fragment);

    this.className = "attachment";

    this.shadowRoot
      .querySelector(".preview-attachment")
      .setAttribute(
        "title",
        browser.i18n.getMessage("attachments.preview.tooltip")
      );
    this.shadowRoot
      .querySelector(".download-attachment")
      .setAttribute(
        "title",
        browser.i18n.getMessage("attachments.download.tooltip")
      );
    this.shadowRoot
      .querySelector(".open-attachment")
      .setAttribute(
        "title",
        browser.i18n.getMessage("attachments.open.tooltip")
      );
    this.shadowRoot
      .querySelector(".more-attachment")
      .setAttribute(
        "title",
        browser.i18n.getMessage("message.moreMenu.tooltip")
      );

    this.#attachmentImageClickListener = this.#attachmentImageClick.bind(this);
    this.shadowRoot
      .querySelector(".attachmentThumb")
      .addEventListener("click", this.#attachmentImageClickListener);
    this.#previewClickListener = this.#previewAttachment.bind(this);
    this.shadowRoot
      .querySelector(".preview-attachment")
      .addEventListener("click", this.#previewClickListener);
    this.#openClickListener = this.#openAttachment.bind(this);
    this.shadowRoot
      .querySelector(".open-attachment")
      .addEventListener("click", this.#openClickListener);
    this.#downloadClickListener = this.#downloadAttachment.bind(this);
    this.shadowRoot
      .querySelector(".download-attachment")
      .addEventListener("click", this.#downloadClickListener);
    this.#displayMoreMenuListener = this.#displayMoreMenu.bind(this);
    this.shadowRoot
      .querySelector(".attachmentsDropDown")
      .addEventListener("click", this.#displayMoreMenuListener);

    for (let attr of Attachment.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
  }

  disconnectedCallback() {
    this.#connected = false;
    if (this.#attachmentImageClickListener) {
      this.shadowRoot
        .querySelector(".attachmentThumb")
        .removeEventListener("click", this.#attachmentImageClickListener);
      this.shadowRoot
        .querySelector(".preview-attachment")
        .removeEventListener("click", this.#previewClickListener);
      this.#openClickListener = this.#openAttachment.bind(this);
      this.shadowRoot
        .querySelector(".download-attachment")
        .removeEventListener("click", this.#openClickListener);
      this.#downloadClickListener = this.#downloadAttachment.bind(this);
      this.shadowRoot
        .querySelector(".open-attachment")
        .removeEventListener("click", this.#downloadClickListener);
      this.shadowRoot
        .querySelector(".attachmentsDropDown")
        .removeEventListener("click", this.#displayMoreMenu);
      this.#attachmentImageClickListener = null;
      this.#previewClickListener = null;
      this.#openClickListener = null;
      this.#downloadClickListener = null;
      this.#displayMoreMenuListener = null;
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
    if (!this.#connected) {
      return;
    }
    switch (name) {
      case "details":
        this.#extractDetails(newValue);
        this.#updateDetails();
        this.#displayImage();
        this.#setupButtons();
        break;
    }
  }

  /**
   * Extracts the message information from the details attribute.
   *
   * @param {string} details
   */
  #extractDetails(details) {
    let [msgId, index] = details.split(",");
    let message = messageUtils.store
      .getState()
      .messages.msgData.find((msg) => msg.id == msgId);
    if (!message) {
      console.warn(`Message ${msgId} not found for attachment data`);
      return;
    }
    this.#msgId = parseInt(msgId);
    this.#attachmentDetails = message.attachments[index];
    this.#isDeleted =
      this.#attachmentDetails.contentType == "text/x-moz-deleted";
    this.#isImage = this.#attachmentDetails.contentType.startsWith("image/");
  }

  /**
   * Handles updating the general details.
   */
  #updateDetails() {
    if (!this.#attachmentDetails) {
      return;
    }
    this.shadowRoot.querySelector(".filesize").textContent =
      this.#attachmentDetails.formattedSize;
    this.shadowRoot.querySelector(".filename").textContent =
      this.#attachmentDetails.name;

    let moreMenu = this.shadowRoot.querySelector("attachment-more-menu");
    moreMenu.setAttribute("msgId", this.#msgId.toString());
    moreMenu.setAttribute("filename", this.#attachmentDetails.name);
    moreMenu.setAttribute("partname", this.#attachmentDetails.partName);
  }

  /**
   * Handles displaying the image.
   */
  #displayImage() {
    if (!this.#attachmentDetails) {
      return;
    }

    let contentType = this.#attachmentDetails.contentType;
    let thumb = this.shadowRoot.querySelector(".attachmentThumb");
    let image = thumb.querySelector("img");
    if (image.src.startsWith("blob")) {
      URL.revokeObjectURL(image.src);
    }
    if (contentType == "text/x-moz-deleted") {
      thumb.classList.add("deleted");
      image.className = "mime-icon";
      image.src = "../content/icons/" + this.#iconForMimeType(contentType);
      image.title = this.#attachmentDetails.name;
      return;
    }

    if (!contentType.startsWith("image")) {
      thumb.classList.remove("deleted");
      image.className = "mime-icon";
      image.src = "../content/icons/" + this.#iconForMimeType(contentType);
      image.title = browser.i18n.getMessage("attachments.open.tooltip");
      return;
    }

    thumb.classList.remove("deleted");
    image.title = browser.i18n.getMessage("attachments.viewAttachment.tooltip");
    // Blank out the image, e.g. for when changing between messages.
    image.src = "";

    (async () => {
      let msgId = this.#msgId;
      let partName = this.#attachmentDetails.partName;
      if (!msgId || !partName) {
        return;
      }
      let file = await browser.messages.getAttachmentFile(msgId, partName);

      // TODO: Set id, partname & contentType all at the same time to avoid multiple redraws.
      // Could we just set id & part number & get details from store?
      if (
        !file ||
        this.#msgId != msgId ||
        this.#attachmentDetails.partName != partName
      ) {
        return;
      }
      image.src = URL.createObjectURL(file);
      image.className = "resize-me";
    })().catch(console.error);
  }

  /**
   * Handles setting up the buttons.
   */
  #setupButtons() {
    if (!this.#attachmentDetails) {
      return;
    }

    if (this.#isDeleted) {
      this.shadowRoot
        .querySelector(".attachmentThumb")
        .classList.add("deleted");
      this.shadowRoot
        .querySelector(".attachmentThumb > img")
        .setAttribute(
          "title",
          browser.i18n.getMessage("attachments.open.tooltip")
        );
      this.shadowRoot.querySelector(".attachActions").classList.add("hidden");
      return;
    }

    let imgTitle = this.#isImage
      ? browser.i18n.getMessage("attachments.viewAttachment.tooltip")
      : browser.i18n.getMessage("attachments.open.tooltip");

    this.shadowRoot
      .querySelector(".attachmentThumb")
      .classList.remove("deleted");
    this.shadowRoot
      .querySelector(".attachmentThumb > img")
      .setAttribute("title", imgTitle);
    let previewAttachmentButton = this.shadowRoot.querySelector(
      ".preview-attachment"
    );
    if (this.#isImage) {
      previewAttachmentButton.classList.remove("hidden");
    } else {
      previewAttachmentButton.classList.add("hidden");
    }
    this.shadowRoot.querySelector(".attachActions").classList.remove("hidden");
  }

  /**
   * Returns the name of the icon for the mimeType.
   *
   * @param {string} mimeType
   * @returns {string}
   */
  #iconForMimeType(mimeType) {
    if (ICON_MAPPING.has(mimeType)) {
      return ICON_MAPPING.get(mimeType) + ".svg";
    }
    let split = mimeType.split("/");
    if (split.length && FALLBACK_ICON_MAPPING.has(split[0] + "/")) {
      return FALLBACK_ICON_MAPPING.get(split[0] + "/") + ".svg";
    }
    return "gtk-file.png";
  }

  /**
   * Handles clicking on the image thumb.
   *
   * @param {Event} event
   */
  #attachmentImageClick(event) {
    if (this.#isDeleted) {
      return;
    }

    this.#isImage
      ? this.#previewAttachment(event)
      : this.#openAttachment(event);
  }

  /**
   * Handles clicking on preview attachment.
   *
   * @param {Event} event
   */
  #previewAttachment(event) {
    event.preventDefault();
    event.stopPropagation();
    messageUtils.store.dispatch(
      attachmentActions.previewAttachment({
        id: this.#msgId,
        partName: this.#attachmentDetails.partName,
      })
    );
  }

  /**
   * Handles clicking on open attachment.
   *
   * @param {Event} event
   */
  #openAttachment(event) {
    event.preventDefault();
    event.stopPropagation();
    messageUtils.store.dispatch(
      attachmentActions.openAttachment({
        id: this.#msgId,
        partName: this.#attachmentDetails.partName,
      })
    );
  }

  /**
   * Handles clicking on download attachment.
   *
   * @param {Event} event
   */
  #downloadAttachment(event) {
    event.preventDefault();
    event.stopPropagation();
    messageUtils.store.dispatch(
      attachmentActions.downloadAttachment({
        id: this.#msgId,
        partName: this.#attachmentDetails.partName,
      })
    );
  }

  /**
   * Handles displaying the more menu.
   *
   * @param {Event} event
   */
  #displayMoreMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    this.shadowRoot
      .querySelector("attachment-more-menu")
      .classList.remove("hidden");

    if (!this.#clickOrBlurListener) {
      this.#clickOrBlurListener = this.#clickOrBlur.bind(this);
      document.addEventListener("click", this.#clickOrBlurListener);
      document.addEventListener("blur", this.#clickOrBlurListener);
      this.#keyListener = this.#keyPress.bind(this);
      document.addEventListener("keypress", this.#keyListener);
    }
  }

  /**
   * Handles clearing the more menu on click or blur.
   *
   * @param {Event} event
   */
  #clickOrBlur(event) {
    event.preventDefault();
    event.stopPropagation();
    this.shadowRoot
      .querySelector("attachment-more-menu")
      .classList.add("hidden");

    document.removeEventListener("click", this.#clickOrBlurListener);
    document.removeEventListener("blur", this.#clickOrBlurListener);
    document.removeEventListener("keypress", this.#keyListener);
    this.#clickOrBlurListener = null;
    this.#keyListener = null;
  }

  /**
   * Handles clearing the more menu when escape is pressed.
   *
   * @param {KeyboardEvent} event
   */
  #keyPress(event) {
    if (event.key == "Escape") {
      this.#clickOrBlur(event);
    }
  }

  // TODO: Fix drag n drop of attachments.
  // onDragStart(event) {
  //   let info;
  //   if (/(^file:|&filename=)/.test(this.props.url)) {
  //     info = this.props.url;
  //   } else {
  //     info =
  //       this.props.url +
  //       "&type=" +
  //       this.props.contentType +
  //       "&filename=" +
  //       encodeURIComponent(this.props.name);
  //   }
  //   event.dataTransfer.setData(
  //     "text/x-moz-url",
  //     `${info}\n${this.props.name}\n${this.props.size}`
  //   );
  //   event.dataTransfer.setData("text/x-moz-url-data", this.props.url);
  //   event.dataTransfer.setData("text/x-moz-url-desc", this.props.name);
  //   event.dataTransfer.setData(
  //     "application/x-moz-file-promise-url",
  //     this.props.url
  //   );
  //   event.dataTransfer.setData("application/x-moz-file-promise", null);
  //   event.stopPropagation();
  // }

  /** @type {?(event) => {}} */
  #displayMoreMenuListener = null;
  /** @type {?(event) => {}} */
  #attachmentImageClickListener = null;
  /** @type {?(event) => {}} */
  #previewClickListener = null;
  /** @type {?(event) => {}} */
  #openClickListener = null;
  /** @type {?(event) => {}} */
  #downloadClickListener = null;
  /** @type {?(event) => {}} */
  #clickOrBlurListener = null;
  /** @type {?(event) => {}} */
  #keyListener = null;

  /** @type {HTMLTemplateElement} */
  static #template;

  #connected = false;

  /** @type {number} */
  #msgId;
  /** @type {?MsgAttachment} */
  #attachmentDetails = null;
  #isImage = false;
  #isDeleted = false;
}
customElements.define("conv-attachment", Attachment);

/**
 * Handles display of attachments within a message, including options that
 * apply to all attachments.
 */
class AttachmentList extends HTMLElement {
  static observedAttributes = ["msgid", "attachments"];

  static get fragment() {
    if (!this.#template) {
      let parser = new DOMParser();

      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/message/iconLinks.css?v=1" />
          <link rel="stylesheet" href="../content/components/message/attachments.css?v=1" />
          <ul class="attachments">
            <div class="attachHeader">
              &nbsp;
              <a class="icon-link download-all">
                <svg-icon hash="file_download"></svg-icon> 
              </a>
              <a class="icon-link view-all">
                <svg-icon hash="photo_library"></svg-icon> 
              </a>
            </div>
          </ul>
        </template>
        `,
        "text/html"
      );
      this.#template = document.importNode(doc.querySelector("template"), true);
    }
    return this.#template.content.cloneNode(true);
  }

  connectedCallback() {
    this.#connected = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(AttachmentList.fragment);

    for (let attr of AttachmentList.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }

    this.#downloadAllListener = this.#downloadAll.bind(this);
    this.shadowRoot
      .querySelector(".download-all")
      .addEventListener("click", this.#downloadAllListener);
    this.#viewAllListener = this.#viewAll.bind(this);
    this.shadowRoot
      .querySelector(".view-all")
      .addEventListener("click", this.#viewAllListener);
  }

  disconnectedCallback() {
    this.#connected = false;
    if (this.#downloadAllListener) {
      this.shadowRoot
        .querySelector(".download-all")
        .removeEventListener("click", this.#downloadAllListener);
      this.#downloadAllListener = null;
      this.shadowRoot
        .querySelector(".view-all")
        .removeEventListener("click", this.#viewAllListener);
      this.#viewAllListener = null;
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
    if (!this.#connected) {
      return;
    }
    switch (name) {
      case "msgid":
        this.#msgId = parseInt(newValue);
        this.#updateView();
        break;
      case "attachments":
        this.#attachments = JSON.parse(newValue);
        this.#updateView();
        break;
    }
  }

  #updateView() {
    if (!this.#attachments) {
      return;
    }

    let message = messageUtils.store
      .getState()
      .messages.msgData.find((msg) => msg.id == this.#msgId);
    this.shadowRoot.querySelector(".attachHeader").firstChild.textContent =
      message.attachmentsPlural;
    this.shadowRoot
      .querySelector(".view-all")
      .classList.toggle(
        "hidden",
        !this.#attachments.some((a) => a.contentType.startsWith("image"))
      );

    let attachmentElements =
      this.shadowRoot.querySelectorAll("conv-attachment");

    let attachmentsWrapper = this.shadowRoot.querySelector(".attachments");
    for (let i = 0; i < this.#attachments.length; i++) {
      if (attachmentElements.length > i) {
        let element = attachmentElements[i];
        element.setAttribute("details", `${this.#msgId},${i}`);
      } else {
        let element = document.createElement("conv-attachment");
        element.setAttribute("details", `${this.#msgId},${i}`);
        attachmentsWrapper.append(element);
      }
    }
    for (
      let i = attachmentElements.length - 1;
      i >= this.#attachments.length;
      i--
    ) {
      attachmentElements[i].remove();
    }
  }

  /**
   * Handles the download all button action.
   */
  #downloadAll() {
    let message = messageUtils.store
      .getState()
      .messages.msgData.find((msg) => msg.id == this.#msgId);
    messageUtils.store.dispatch(
      attachmentActions.downloadAll({
        id: this.#msgId,
        partNames: message.attachments.map((a) => a.partName),
      })
    );
  }

  /**
   * Handles the view all button action
   */
  #viewAll() {
    messageUtils.store.dispatch(
      attachmentActions.showGalleryView({
        id: this.#msgId,
      })
    );
  }

  #connected = false;
  /** @type {number} */
  #msgId;
  /** @type {MsgAttachment[]} */
  #attachments;

  /** @type {(Event) => void} */
  #downloadAllListener = null;
  /** @type {(Event) => void} */
  #viewAllListener = null;

  /** @type {HTMLTemplateElement} */
  static #template;
}
customElements.define("conv-attachment-list", AttachmentList);
