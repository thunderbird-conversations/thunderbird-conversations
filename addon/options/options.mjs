/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @typedef {object} OptionChoice
 * @property {string} desc
 * @property {number} value
 */

/**
 * @typedef {object} OptionProperties
 * @property {string} title
 * @property {string} desc
 * @property {string} name
 * @property {OptionChoice[]} [choices]
 */

/**
 * A list of all preferences that can be set via the GUI.
 * `desc` and `name` will get run through l10n before being rendered.
 *
 * @type {{props: OptionProperties, component: string}[]}
 */
const PREFS_INFO = [
  {
    props: {
      title: "options.expand_who",
      desc: "",
      name: "expand_who",
      choices: [
        { desc: "options.expand_none", value: 1 },
        { desc: "options.expand_all", value: 3 },
        { desc: "options.expand_auto", value: 4 },
      ],
    },
    component: "choice-option",
  },
  {
    props: {
      title: "options.quoting_title",
      desc: "options.quoting_desc",
      name: "hide_quote_length",
    },
    component: "numeric-option",
  },
  {
    props: {
      title: "options.hide_sigs_title",
      desc: "options.hide_sigs_desc",
      name: "hide_sigs",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.friendly_date_title",
      desc: "options.friendly_date_desc",
      name: "no_friendly_date",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.tweak_chrome_title",
      desc: "options.tweak_chrome_desc",
      name: "tweak_chrome",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.tweak_bodies_title",
      desc: "options.tweak_bodies_desc",
      name: "tweak_bodies",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.operate_on_conversations_title",
      desc: "options.operate_on_conversations_desc",
      name: "operate_on_conversations",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.extra_attachments_title",
      desc: "options.extra_attachments_desc",
      name: "extra_attachments",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.hide_quick_reply_title",
      desc: "options.hide_quick_reply_desc",
      name: "hide_quick_reply",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.disable_between_column_title",
      desc: "options.disable_between_column_desc",
      name: "disableBetweenColumn",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.compose_in_tab2_title",
      desc: "options.compose_in_tab2_desc",
      name: "compose_in_tab",
    },
    component: "binary-option",
  },
  {
    props: {
      title: "options.debugging_title",
      desc: "options.debugging_desc",
      name: "logging_enabled",
    },
    component: "binary-option",
  },
];

/**
 * Base class for all options.
 */
class OptionBase extends HTMLElement {
  /**
   * @abstract
   * @param {OptionProperties} properties
   * @param {any} initialValue
   */
  setProps(properties, initialValue) {}

  /**
   * Saves a preference,
   *
   * @param {string} name
   * @param {any} value
   */
  async savePref(name, value) {
    let prefs = await browser.storage.local.get("preferences");
    await browser.storage.local.set({
      preferences: { ...prefs.preferences, [name]: value },
    });
  }
}

/**
 * Options class to support numeric options.
 */
export class ChoiceOption extends OptionBase {
  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="options.css" />
          <link rel="stylesheet" href="../common.css" type="text/css" />
          <div class="descriptionWrapper">
            <label class="title"></label>
            <br>
            <label class="desc"></label>
          </div>
          <div class="inputWrapper">
            <span class="inputDetail"></span>
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
    this.shadowRoot.appendChild(ChoiceOption.fragment);
  }

  /**
   * @param {OptionProperties} properties
   * @param {any} initialValue
   */
  setProps(properties, initialValue) {
    let title = /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".title")
    );
    title.innerText = browser.i18n.getMessage(properties.title);
    title.htmlFor = properties.name;
    /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".desc")
    ).innerText = browser.i18n.getMessage(properties.desc);

    let inputDetail = this.shadowRoot.querySelector(".inputDetail");
    let elementName = `choice_${properties.title}`.replace(/\s+/g, "");

    for (let [i, choice] of properties.choices.entries()) {
      let input = document.createElement("input");
      input.setAttribute("name", properties.name);
      input.id = `${elementName}-${i}`;
      input.type = "radio";
      input.value = choice.value.toString();
      input.checked = choice.value == initialValue;
      input.addEventListener("change", this.onChange.bind(this));
      inputDetail.appendChild(input);
      let label = document.createElement("label");
      label.htmlFor = input.id;
      label.innerText = browser.i18n.getMessage(choice.desc);
      inputDetail.appendChild(label);
    }
  }

  onChange(event) {
    this.savePref(
      event.target.getAttribute("name"),
      parseInt(event.target.value, 10)
    ).catch(console.error);
  }
}
customElements.define("choice-option", ChoiceOption);

/**
 * Options class to support numeric options.
 */
export class NumericOption extends OptionBase {
  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="options.css" />
          <link rel="stylesheet" href="../common.css" type="text/css" />
          <div class="descriptionWrapper">
            <label class="title"></label>
            <br>
            <label class="desc"></label>
          </div>
          <div class="inputWrapper">
            <input type="number" class="pref hidespinbuttons" min="0" max="100">
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
    this.shadowRoot.appendChild(NumericOption.fragment);
  }

  /**
   * @param {OptionProperties} properties
   * @param {any} initialValue
   */
  setProps(properties, initialValue) {
    let title = /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".title")
    );
    title.innerText = browser.i18n.getMessage(properties.title);
    title.htmlFor = properties.name;
    /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".desc")
    ).innerText = browser.i18n.getMessage(properties.desc);
    let input = this.shadowRoot.querySelector("input");
    input.id = properties.name;
    input.value = initialValue;
    input.addEventListener("change", this.onChange.bind(this));
  }

  onChange(event) {
    if (isNaN(parseInt(event.target.value))) {
      event.target.value = event.target.getAttribute("min");
    }
    this.savePref(event.target.id, parseInt(event.target.value, 10)).catch(
      console.error
    );
  }
}
customElements.define("numeric-option", NumericOption);

/**
 * Options class to support binary options.
 */
export class BinaryOption extends OptionBase {
  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="options.css" />
          <div class="descriptionWrapper">
            <label class="title"></label>
            <br>
            <label class="desc"></label>
          </div>
          <div class="inputWrapper">
            <input type="checkbox" class="pref">
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
    this.shadowRoot.appendChild(BinaryOption.fragment);
  }

  /**
   * @param {OptionProperties} properties
   * @param {any} initialValue
   */
  setProps(properties, initialValue) {
    let title = /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".title")
    );
    title.innerText = browser.i18n.getMessage(properties.title);
    title.htmlFor = properties.name;
    /** @type {HTMLLabelElement} */ (
      this.shadowRoot.querySelector(".desc")
    ).innerText = browser.i18n.getMessage(properties.desc);
    let input = this.shadowRoot.querySelector("input");
    input.id = properties.name;
    input.checked = initialValue;
    input.addEventListener("change", this.onChange.bind(this));
  }

  onChange(event) {
    this.savePref(event.target.id, event.target.checked).catch(console.error);
  }
}
customElements.define("binary-option", BinaryOption);

/**
 * Render the options list for Conversations. `localizedPrefsInfo`
 * should be an array following the format of `PREFS_INFO`, but
 * localized. `localizedName` is the localized name of the extension.
 * `prefs` should be an object whose keys are the `name`s mentioned in
 * `localizedPrefsInfo`. And, `setPref` should be a function that accepts
 * `(name, value)` pairs and saves them as preferences.
 */
export class ConversationOptions extends HTMLElement {
  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="options.css" type="text/css" />
          <link rel="stylesheet" href="../common.css" type="text/css" />
          <h1 class="pageTitle">Foo</h1>
          <form class="conversationOptions">
            <div class="preferencesGrid">
            </div>
          </form>
          <button class="start"></button>
          <button class="undo"></button>
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
    this.shadowRoot.appendChild(ConversationOptions.fragment);
    this.shadowRoot.querySelector(".pageTitle").textContent =
      browser.i18n.getMessage("extensionName");

    let startButton = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".start")
    );
    startButton.innerText = browser.i18n.getMessage(
      "options.start_setup_assistant"
    );
    startButton.addEventListener("click", this.startSetupAssistant.bind(this));

    let undoButton = /** @type {HTMLButtonElement} */ (
      this.shadowRoot.querySelector(".undo")
    );
    undoButton.innerText = browser.i18n.getMessage(
      "options.undoCustomizations"
    );
    undoButton.title = browser.i18n.getMessage(
      "options.undoCustomizations.tooltip"
    );
    undoButton.addEventListener(
      "click",
      this.startUndoConversations.bind(this)
    );
  }

  async connectedCallback() {
    let prefsGrid = this.shadowRoot.querySelector(".preferencesGrid");
    let prefs = await browser.storage.local.get("preferences");

    for (let prefInfo of PREFS_INFO) {
      let option = /** @type {OptionBase} */ (
        document.createElement(prefInfo.component)
      );
      option.className = "prefSectionContent";
      option.setProps(prefInfo.props, prefs.preferences[prefInfo.props.name]);
      prefsGrid.appendChild(option);
    }
  }

  startSetupAssistant() {
    browser.tabs.create({
      url: "../assistant/assistant.html",
    });
  }

  startUndoConversations() {
    let port = browser.runtime.connect({ name: "assistant" });
    port.postMessage({});
  }
}
