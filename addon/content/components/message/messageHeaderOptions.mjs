/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { messageActions } from "../../reducer/reducerMessages.mjs";
import { messageUtils } from "../../reducer/messageUtils.mjs";

/**
 * @import {ActionButton} from "./messageActionButton.mjs"
 */

/**
 * Handles display of the options menu.
 */
export class OptionsMoreMenu extends HTMLElement {
  static observedAttributes = [
    "msgid",
    "multiplerecipients",
    "recipientsincludelists",
  ];

  static get fragment() {
    if (!this.#template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
        <link rel="stylesheet" href="../content/components/message/tooltip.css?v=1" />
        <link rel="stylesheet" href="../content/components/message/messageHeaderOptions.css?v=1" />
        <div class="tooltip tooltip-menu menu">
          <div class="arrow"></div>
          <div class="arrow inside"></div>
          <ul>
            <li class="action-reply">
              <action-button additionalclass="dropDown" showString="true" type="reply"></action-button>
            </li>
            <li class="action-replyAll">
              <action-button additionalclass="dropDown" showString="true" type="replyAll"></action-button>
            </li>
            <li class="action-replyList">
              <action-button additionalclass="dropDown" showString="true" type="replyList"></action-button>
            </li>
            <li class="action-editNew">
              <action-button additionalclass="dropDown" showString="true" type="editAsNew"></action-button>
            </li>
            <li class="action-forward dropdown-sep">
              <action-button additionalclass="dropDown" showString="true" type="forward"></action-button>
            </li>
            <li class="action-archive">
              <action-button additionalclass="dropDown" showString="true" type="archive"></action-button>
            </li>
            <li class="action-delete">
              <action-button additionalclass="dropDown" showString="true" type="delete"></action-button>
            </li>
            <li class="action-classic">
              <action-button additionalclass="dropDown" showString="true" type="classic"></action-button>
            </li>
            <li class="action-source">
              <action-button additionalclass="dropDown" showString="true" type="source"></action-button>
            </li>
          </ul>
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
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(OptionsMoreMenu.fragment);

    for (let attr of OptionsMoreMenu.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
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
    if (!this.shadowRoot) {
      return;
    }

    switch (name) {
      case "msgid": {
        for (let item of this.shadowRoot.querySelectorAll("action-button")) {
          item.setAttribute("msgid", newValue);
        }
        break;
      }
      case "multiplerecipients": {
        let replyAll = /** @type {ActionButton} */ (
          this.shadowRoot.querySelector(".action-replyAll")
        );
        replyAll.style.display = this.hasAttribute("multiplerecipients")
          ? "revert"
          : "none";

        break;
      }
      case "recipientsincludelists": {
        let list = /** @type {ActionButton} */ (
          this.shadowRoot.querySelector(".action-replyList")
        );
        list.style.display = this.hasAttribute("recipientsincludelists")
          ? "revert"
          : "none";
        break;
      }
    }
  }

  /** @type {HTMLTemplateElement} */
  static #template;
}
customElements.define("options-more-menu", OptionsMoreMenu);

/**
 * Handles display of options in the message header.
 */
export class MessageHeaderOptions extends HTMLElement {
  static observedAttributes = [
    "msgid",
    "detailsshowing",
    "expanded",
    "multiplerecipients",
    "recipientsincludelists",
    "isdraft",
  ];

  static get fragment() {
    if (!this.#template) {
      // Manually constructed to avoid bad layout (whitespace insertion) when using DOMParser.
      let template = document.createElement("template");

      let link = document.createElement("link");
      link.setAttribute("rel", "stylesheet");
      link.setAttribute(
        "href",
        "../content/components/message/messageHeaderOptions.css?v=1"
      );
      template.content.appendChild(link);

      let div = document.createElement("div");
      div.className = "options";
      template.content.appendChild(div);

      let attachIconSpan = document.createElement("span");
      attachIconSpan.className = "attachmentIcon";
      div.appendChild(attachIconSpan);

      let attachIcon = document.createElement("svg-icon");
      attachIcon.setAttribute("hash", "attachment");
      attachIconSpan.appendChild(attachIcon);

      let dateSlot = document.createElement("slot");
      dateSlot.setAttribute("name", "date");
      div.appendChild(dateSlot);

      let mainActionButtonSpan = document.createElement("span");
      mainActionButtonSpan.className = "mainActionButton";
      div.appendChild(mainActionButtonSpan);

      let mainActionButton = document.createElement("action-button");
      mainActionButton.setAttribute("additionalclass", "header");
      mainActionButtonSpan.appendChild(mainActionButton);

      let detailsHiddenSpan = document.createElement("span");
      detailsHiddenSpan.className = "details-hidden";
      div.appendChild(detailsHiddenSpan);

      let detailsHiddenBtn = document.createElement("button");
      detailsHiddenBtn.className = "icon-link";
      detailsHiddenSpan.appendChild(detailsHiddenBtn);

      let detailsHiddenIcon = document.createElement("svg-icon");
      detailsHiddenIcon.setAttribute("aria-hidden", "true");
      detailsHiddenBtn.appendChild(detailsHiddenIcon);

      let dropDownSpan = document.createElement("span");
      dropDownSpan.className = "dropDown";
      div.appendChild(dropDownSpan);

      let dropDownButton = document.createElement("button");
      dropDownButton.classList.add("options-menu-button", "icon-link");
      dropDownSpan.appendChild(dropDownButton);

      let dropDownIcon = document.createElement("svg-icon");
      dropDownIcon.setAttribute("aria-hidden", "true");
      dropDownIcon.setAttribute("hash", "more_vert");
      dropDownButton.appendChild(dropDownIcon);

      let optionsMoreMenu = document.createElement("options-more-menu");
      optionsMoreMenu.style.display = "none";
      dropDownSpan.appendChild(optionsMoreMenu);

      this.#template = template;
    }
    return this.#template.content.cloneNode(true);
  }

  constructor() {
    super();
    this.optionsButtonClick = this.optionsButtonClick.bind(this);
    this.hideMenu = this.hideMenu.bind(this);
    this.keyListener = this.keyListener.bind(this);
    this.showDetails = this.showDetails.bind(this);
  }

  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(MessageHeaderOptions.fragment);

    for (let attr of MessageHeaderOptions.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
    this.shadowRoot
      .querySelector(".options-menu-button")
      .addEventListener("click", this.optionsButtonClick);
    this.shadowRoot
      .querySelector(".details-hidden > button")
      .addEventListener("click", this.showDetails);
  }

  disconnectedCallback() {
    this.shadowRoot
      .querySelector(".options-menu-button")
      .removeEventListener("click", this.optionsButtonClick);
    this.shadowRoot
      .querySelector(".details-hidden > button")
      .removeEventListener("click", this.showDetails);
    if (this.#menuDisplayed) {
      document.removeEventListener("button-clicked", this.hideMenu);
      document.removeEventListener("click", this.hideMenu);
      document.removeEventListener("blur", this.hideMenu);
      document.removeEventListener("keypress", this.keyListener);
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
    if (!this.shadowRoot) {
      return;
    }

    switch (name) {
      case "msgid": {
        this.shadowRoot
          .querySelector("options-more-menu")
          .setAttribute("msgid", newValue);
        this.shadowRoot
          .querySelector(".mainActionButton > action-button")
          .setAttribute("msgid", newValue);
        break;
      }
      case "detailsshowing": {
        let detailsBtn = this.shadowRoot.querySelector(
          ".details-hidden > button"
        );
        let detailsSvg = detailsBtn.firstElementChild;

        if (this.hasAttribute("detailsshowing")) {
          detailsBtn.setAttribute(
            "title",
            browser.i18n.getMessage("message.hideDetails.tooltip")
          );
          detailsSvg.setAttribute("hash", "info");
        } else {
          detailsBtn.setAttribute(
            "title",
            browser.i18n.getMessage("message.showDetails.tooltip")
          );
          detailsSvg.setAttribute("hash", "info_outline");
        }
        break;
      }
      case "multiplerecipients": {
        let optionsMenu = this.shadowRoot.querySelector("options-more-menu");
        if (this.hasAttribute("multiplerecipients")) {
          optionsMenu.setAttribute("multiplerecipients", newValue);
        } else {
          optionsMenu.removeAttribute("multiplerecipients");
        }
        this.setActionButtonType();
        break;
      }
      case "recipientsincludelists": {
        let optionsMenu = this.shadowRoot.querySelector("options-more-menu");
        if (this.hasAttribute("recipientsincludelists")) {
          optionsMenu.setAttribute("recipientsincludelists", newValue);
        } else {
          optionsMenu.removeAttribute("recipientsincludelists");
        }
        this.setActionButtonType();
        break;
      }
      case "isdraft": {
        this.setActionButtonType();
        break;
      }
      case "expanded": {
        let expanded = this.hasAttribute("expanded");
        console.log("expanded", expanded);
        /** @type {HTMLSpanElement} */ (
          this.shadowRoot.querySelector(".mainActionButton")
        ).style.display = expanded ? "revert" : "none";
        /** @type {HTMLSpanElement} */ (
          this.shadowRoot.querySelector(".details-hidden")
        ).style.display = expanded ? "revert" : "none";
        /** @type {HTMLSpanElement} */ (
          this.shadowRoot.querySelector(".dropDown")
        ).style.display = expanded ? "revert" : "none";
        break;
      }
    }
  }

  /**
   * Handles toggling the show of details.
   *
   * @param {Event} event
   */
  showDetails(event) {
    event.preventDefault();
    event.stopPropagation();

    messageUtils.store.dispatch(
      messageActions.showMsgDetails({
        id: Number(this.getAttribute("msgid")),
        detailsShowing: !this.hasAttribute("detailsshowing"),
      })
    );
  }

  setActionButtonType() {
    let actionButtonType = "reply";
    if (this.hasAttribute("isdraft")) {
      actionButtonType = "draft";
    } else if (this.hasAttribute("recipientsincludelists")) {
      actionButtonType = "replyList";
    } else if (this.hasAttribute("multiplerecipients")) {
      actionButtonType = "replyAll";
    }
    this.shadowRoot
      .querySelector(".mainActionButton > action-button")
      .setAttribute("type", actionButtonType);
  }

  /**
   * Handles the options menu button being clicked.
   *
   * @param {Event} event
   */
  optionsButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.#menuDisplayed) {
      this.hideMenu();
    } else {
      this.showMenu();
    }
  }

  showMenu() {
    if (this.#menuDisplayed) {
      return;
    }

    let optionsMenu = /** @type {OptionsMoreMenu} */ (
      this.shadowRoot.querySelector("options-more-menu")
    );
    optionsMenu.style.display = "revert";

    document.addEventListener("button-clicked", this.hideMenu);
    document.addEventListener("click", this.hideMenu);
    document.addEventListener("blur", this.hideMenu);
    document.addEventListener("keypress", this.keyListener);

    this.#menuDisplayed = true;
  }

  hideMenu() {
    if (!this.#menuDisplayed) {
      return;
    }

    document.removeEventListener("button-clicked", this.hideMenu);
    document.removeEventListener("click", this.hideMenu);
    document.removeEventListener("blur", this.hideMenu);
    document.removeEventListener("keypress", this.keyListener);

    let optionsMenu = /** @type {OptionsMoreMenu} */ (
      this.shadowRoot.querySelector("options-more-menu")
    );
    optionsMenu.style.display = "none";
    this.#menuDisplayed = false;
  }

  /**
   * Handles closing the menu when the escape key is pressed.
   *
   * @param {KeyboardEvent} event
   */
  keyListener(event) {
    if (event.key == "Escape") {
      this.hideMenu();
    }
  }

  #menuDisplayed = false;

  /** @type {HTMLTemplateElement} */
  static #template;
}
customElements.define("message-header-options", MessageHeaderOptions);
