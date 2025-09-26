/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { summaryActions } from "../reducer/reducerSummary.mjs";

const DEFAULT_AVATAR_URI =
  "chrome://messenger/skin/addressbook/icons/contact-generic.svg";

/**
 * Handles the ConversationFooter layout.
 */
export class ContactDetail extends HTMLElement {
  static observedAttributes = [
    "avatar",
    "contactid",
    "contactisreadonly",
    "name",
    "realemail",
  ];

  static dispatch;

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="conversation.css?v=1" />
          <div class="tooltip">
            <div class="arrow"></div>
            <div class="arrow inside"></div>
            <div class="authorInfoContainer">
              <div class="authorInfo">
                <span class="name"></span>
                <span class="authorEmail">
                  <span class="authorEmailAddress"></span>
                  <button class="copyEmail">
                    <svg-icon hash="content_copy"></svg-icon>
                  </button>
                </span>
              </div>
              <div class="authorPicture">
                <img src="${DEFAULT_AVATAR_URI}">
              </div>
            </div>
            <div class="tipFooter">
              <button class="sendEmail">
                <svg-icon hash="mail"><svg-icon>
              </button>
              <button class="showInvolving">
                <svg-icon hash="history"><svg-icon>
              </button>
              <button id="contact">
                <svg-icon hash="person">
              </button>
              <button class="createFilter">
              </button>
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
    this.shadowRoot.appendChild(ContactDetail.fragment);

    let tooltip = this.shadowRoot.querySelector(".tooltip");
    tooltip.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
    });

    let copyEmail = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".copyEmail")
    );
    copyEmail.title = browser.i18n.getMessage("contact.copyEmailTooltip");
    copyEmail.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      ContactDetail.dispatch(
        summaryActions.copyEmail({ email: this.getAttribute("realEmail") })
      );
    });

    let sendEmail = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".sendEmail")
    );
    sendEmail.title = browser.i18n.getMessage("contact.sendEmailTooltip");
    sendEmail.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      ContactDetail.dispatch(
        summaryActions.sendEmail({
          msgId: this.getAttribute("msgId"),
          name: this.getAttribute("name"),
          email: this.getAttribute("realEmail"),
        })
      );
    });

    let showInvolving = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".showInvolving")
    );
    showInvolving.title = browser.i18n.getMessage(
      "contact.recentConversationsTooltip"
    );
    showInvolving.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      ContactDetail.dispatch(
        summaryActions.showMessagesInvolving({
          name: this.getAttribute("name"),
          email: this.getAttribute("realEmail"),
        })
      );
    });

    let contactButton = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("#contact")
    );
    contactButton.title = browser.i18n.getMessage("contact.addContactTooltip");
    contactButton.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      let contactId = this.getAttribute("contactId");
      if (contactId) {
        ContactDetail.dispatch(summaryActions.editContact({ contactId }));
      } else {
        ContactDetail.dispatch(
          summaryActions.addContact({
            name: this.getAttribute("name"),
            email: this.getAttribute("realEmail"),
          })
        );
      }
    });

    let createFilter = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".createFilter")
    );
    createFilter.textContent = browser.i18n.getMessage(
      "contact.createFilterTooltip"
    );
    createFilter.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      ContactDetail.dispatch(
        summaryActions.createFilter({
          email: this.getAttribute("realEmail"),
        })
      );
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
      case "avatar": {
        let avatarElement = /** @type {HTMLImageElement} */ (
          this.shadowRoot.querySelector(".authorPicture > img")
        );
        avatarElement.src = newValue || DEFAULT_AVATAR_URI;
        break;
      }
      case "contactid": {
        this.setupContactDetails();
        break;
      }
      case "contactisreadonly": {
        this.setupContactDetails();
        break;
      }
      case "name": {
        let nameElement = /** @type {HTMLButtonElement} */ (
          this.shadowRoot.querySelector(".name")
        );
        nameElement.title = newValue;
        nameElement.textContent = newValue;
        break;
      }
      case "realemail": {
        let emailElement = /** @type {HTMLButtonElement} */ (
          this.shadowRoot.querySelector(".authorEmailAddress")
        );
        emailElement.title = newValue;
        emailElement.textContent = newValue;
        break;
      }
    }
  }

  setupContactDetails() {
    let contactButton = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector("#contact")
    );
    let contactImage = this.shadowRoot.querySelector("#contact > svg-icon");

    if (this.getAttribute("contactId")) {
      if (this.getAttribute("contactisreadonly")) {
        contactButton.title = browser.i18n.getMessage(
          "contact.viewContactTooltip"
        );
        contactImage.setAttribute("hash", "person");
      } else {
        contactButton.title = browser.i18n.getMessage(
          "contact.editContactTooltip"
        );
        contactImage.setAttribute("hash", "edit");
      }
    } else {
      contactButton.title = browser.i18n.getMessage(
        "contact.addContactTooltip"
      );
      contactImage.setAttribute("hash", "add");
    }
  }
}
customElements.define("contact-detail", ContactDetail);
