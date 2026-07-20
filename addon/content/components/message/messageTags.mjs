/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { setTags } from "../../reducer/messageTagUtils.mjs";
import { messageUtils } from "../../reducer/messageUtils.mjs";

/**
 * Determine if a background color is light enough to require dark text.
 *
 * @param {string} color
 */
function isColorLight(color) {
  const rgb = color.substring(1) || "FFFFFF";
  const [, r, g, b] = rgb
    .match(/(..)(..)(..)/)
    .map((x) => parseInt(x, 16) / 255);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.8;
}

/**
 * A special event for removing tags.
 */
class RemoveTagEvent extends Event {
  static type = "removetag";

  /**
   * Constructor
   *
   * @param {string} tagKey
   */
  constructor(tagKey) {
    super(RemoveTagEvent.type, { bubbles: true });
    this.#tagKey = tagKey;
  }

  get tagKey() {
    return this.#tagKey;
  }

  #tagKey;
}

/**
 * Handles display of a single message tag.
 */
export class MessageTag extends HTMLLIElement {
  static observedAttributes = ["color", "expanded", "name"];

  connectedCallback() {
    if (!this.#domAdded) {
      let span = document.createElement("span");
      span.setAttribute("role", "button");
      span.className = "tag-x";
      span.setAttribute("tabIndex", "0");
      span.textContent = " x";
      this.append("", span);
      this.#domAdded = true;
    }
    for (let attr of MessageTag.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }

    let xButton = this.querySelector("span");
    xButton.setAttribute(
      "aria-label",
      browser.i18n.getMessage("tags.removeButton")
    );

    this.removeTag = this.removeTag.bind(this);
    xButton.addEventListener("click", this.removeTag);
  }

  disconnectedCallback() {
    let xButton = this.querySelector("span");
    xButton.removeEventListener("click", this.removeTag);
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#domAdded) {
      return;
    }

    switch (name) {
      case "color": {
        let isLight = isColorLight(newValue);
        this.className = "tag" + (isLight ? " light-tag" : "");
        this.style.backgroundColor = newValue;
        break;
      }
      case "expanded": {
        let xButton = this.querySelector("span");
        xButton.style.display = newValue ? "inline-block" : "none";
        break;
      }
      case "name": {
        this.firstChild.textContent = newValue;
        break;
      }
    }
  }

  removeTag() {
    this.dispatchEvent(new RemoveTagEvent(this.getAttribute("key")));
  }

  #domAdded = false;
}
customElements.define("message-tag", MessageTag, { extends: "li" });

/**
 * Handles display of message tags within a message.
 */
export class MessageTags extends HTMLUListElement {
  static observedAttributes = ["expanded", "tags"];

  constructor() {
    super();
    this.removeTag = this.removeTag.bind(this);
  }

  connectedCallback() {
    if (!this.#domAdded) {
      this.classList.add("tags", "regular-tags");
      this.#domAdded = true;
    }
    for (let attr of MessageTags.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
    this.addEventListener(RemoveTagEvent.type, this.removeTag);
  }

  disconnectedCallback() {
    this.removeEventListener(RemoveTagEvent.type, this.removeTag);
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.#domAdded) {
      return;
    }

    switch (name) {
      case "expanded": {
        for (let tag of this.querySelectorAll("li")) {
          if (tag.hasAttribute("expanded") && !newValue) {
            tag.removeAttribute("expanded");
          } else if (!tag.hasAttribute("expanded") && newValue) {
            tag.setAttribute("expanded", "true");
          }
        }
        break;
      }
      case "tags": {
        let newChildren = [];
        for (let tag of JSON.parse(newValue)) {
          let element = document.createElement("li", { is: "message-tag" });
          element.setAttribute("name", tag.name);
          if (this.hasAttribute("expanded")) {
            element.setAttribute("expanded", "true");
          }
          element.setAttribute("color", tag.color);
          element.setAttribute("key", tag.key);
          newChildren.push(element);
        }

        this.replaceChildren(...newChildren);
        break;
      }
    }
  }

  /**
   * Handles removing a tag from the list. This is necessary as the
   * API requires all remaining tags to be declared.
   *
   * @param {RemoveTagEvent} event
   */
  removeTag(event) {
    let tagElements = Array.from(this.querySelectorAll("li") ?? []);
    let originalTags = tagElements.map((t) => t.getAttribute("key"));
    let filtered = originalTags.filter((tag) => tag != event.tagKey);

    if (filtered.length != originalTags.length) {
      // Only trigger a change if we actually removed a tag
      setTags(Number(this.getAttribute("msgId")), filtered);
    }
  }

  #domAdded = false;
}
customElements.define("message-tags", MessageTags, { extends: "ul" });

/**
 * A generic handler for display of message tags.
 */
export class SpecialMessageTag extends HTMLLIElement {
  static observedAttributes = ["details", "icon", "name", "strings"];

  static get fragment() {
    if (!this.#template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <img/>
          <span class="tag-text"></span>
          <span class="special-tooltip">
          </span>
        </template>
        `,
        "text/html"
      );
      this.#template = document.importNode(doc.querySelector("template"), true);
    }
    return this.#template.content.cloneNode(true);
  }

  #connected = false;
  #addedClickListener = false;

  constructor() {
    super();
    this.clickListener = this.clickListener.bind(this);
  }

  connectedCallback() {
    this.#connected = true;
    this.appendChild(SpecialMessageTag.fragment);

    for (let attr of SpecialMessageTag.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
  }
  disconnectedCallback() {
    if (this.#addedClickListener) {
      this.removeEventListener("click", this.clickListener);
      this.#addedClickListener = false;
    }
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
    switch (name) {
      case "details": {
        if (newValue) {
          if (!this.#addedClickListener) {
            this.addEventListener("click", this.clickListener);
            this.#addedClickListener = true;
          }
          this.classList.add("can-click");
        } else {
          if (this.#addedClickListener) {
            this.removeEventListener("click", this.clickListener);
            this.#addedClickListener = false;
          }
          this.classList.remove("can-click");
        }
        break;
      }
      case "icon": {
        if (newValue.startsWith("moz-extension://")) {
          let img = document.createElement("img");
          img.classList.add("icon", "special-tag-ext-icon");
          img.setAttribute("src", newValue);
          this.replaceChild(img, this.firstChild);
        } else {
          let svgIcon = document.createElement("svg-icon");
          svgIcon.setAttribute("fullPath", newValue);
          this.replaceChild(svgIcon, this.firstChild);
        }
        break;
      }
      case "name": {
        this.querySelector(".tag-text").textContent = newValue;
        break;
      }
      case "strings": {
        let strings = JSON.parse(this.getAttribute("strings") ?? "[]");

        let children = [];
        for (let string of strings) {
          let div = document.createElement("div");
          div.textContent = string;
          children.push(div);
        }
        let tooltip = this.querySelector(".special-tooltip");
        if (children.length) {
          tooltip.removeAttribute("empty");
        } else {
          tooltip.setAttribute("empty", "true");
        }
        tooltip.replaceChildren(...children);
        break;
      }
    }
  }

  /**
   * Handles clicks.
   *
   * @param {Event} event
   */
  clickListener(event) {
    messageUtils.handleTagClick(
      Number(this.getAttribute("msgid")),
      JSON.parse(this.getAttribute("details"))
    );
  }

  /** @type {HTMLTemplateElement} */
  static #template;
}
customElements.define("special-message-tag", SpecialMessageTag, {
  extends: "li",
});

/**
 * Handles display of all tags for a message.
 */
export class SpecialMessageTags extends HTMLUListElement {
  static observedAttributes = [
    "foldername",
    "foldertagclickable",
    "specialtags",
    "msgid",
  ];

  constructor() {
    super();
    this.folderListener = this.folderListener.bind(this);
  }

  connectedCallback() {
    this.#connected = true;
    this.classList.add("tags", "special-tags");

    for (let attr of SpecialMessageTags.observedAttributes) {
      this.attributeChangedCallback(attr, null, this.getAttribute(attr));
    }
  }

  disconnectedCallback() {
    if (this.#folderListenerAdded) {
      let folderTag = this.querySelector(".in-folder");
      folderTag.removeEventListener("click", this.folderListener);
      this.#folderListenerAdded = false;
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
      case "foldername": {
        if (newValue) {
          let existing = this.querySelector(".in-folder");
          if (existing) {
            existing.textContent = browser.i18n.getMessage("tags.inFolder", [
              this.getAttribute("folderName"),
            ]);
          } else {
            let folderItem = document.createElement("li");
            folderItem.className = "in-folder";
            folderItem.title = browser.i18n.getMessage(
              "tags.jumpToFolder.tooltip"
            );
            folderItem.textContent = browser.i18n.getMessage("tags.inFolder", [
              this.getAttribute("folderName"),
            ]);
            this.appendChild(folderItem);
            if (this.hasAttribute("foldertagclickable")) {
              folderItem.addEventListener("click", this.folderListener);
              this.#folderListenerAdded = true;
            }
          }
        } else {
          let existing = this.querySelector(".in-folder");
          if (this.#folderListenerAdded) {
            existing.removeEventListener("click", this.folderListener);
            this.#folderListenerAdded = false;
          }
          existing?.remove();
        }
        break;
      }
      case "foldertagclickable": {
        let folderItem = this.querySelector(".in-folder");
        if (newValue && folderItem && !this.#folderListenerAdded) {
          folderItem.addEventListener("click", this.folderListener);
          this.#folderListenerAdded = true;
        } else if (!newValue && folderItem && this.#folderListenerAdded) {
          folderItem.removeEventListener("click", this.folderListener);
          this.#folderListenerAdded = false;
        }
        break;
      }
      case "specialtags": {
        let existingInFolder = this.querySelector(".in-folder");
        let newTags = [];
        for (let tag of JSON.parse(newValue ?? "[]")) {
          let element = document.createElement("li", {
            is: "special-message-tag",
          });
          element.classList.add(
            ...(tag.classNames?.split(" ") ?? []),
            "special-tag"
          );
          if (tag.title) {
            element.setAttribute("title", tag.title);
          }
          let msgId = element.getAttribute("id");
          if (msgId) {
            element.setAttribute("msgid", msgId);
          }
          element.setAttribute("icon", tag.icon);
          element.setAttribute("name", tag.name);
          if (tag.details) {
            element.setAttribute("details", JSON.stringify(tag.details));
          }
          element.setAttribute("strings", JSON.stringify(tag.tooltip.strings));
          newTags.push(element);
        }
        if (existingInFolder) {
          newTags.push(existingInFolder);
        }
        this.replaceChildren(...newTags);
        break;
      }
      case "id": {
        for (let tag of document.querySelectorAll("li")) {
          tag.setAttribute("msgid", newValue);
        }
        break;
      }
    }
  }

  /**
   * Handles clicking on the folder tag.
   *
   * @param {Event} event
   */
  folderListener(event) {
    messageUtils.switchToFolderAndMsg(Number(this.getAttribute("msgid")));
  }

  #connected = false;
  #folderListenerAdded = false;
}
customElements.define("special-message-tags", SpecialMessageTags, {
  extends: "ul",
});
