/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// A compatibility layer that can be imported whether in the browser or
// in Thunderbird

import { kPrefDefaults } from "../../prefs.js";

// Make sure the browser object exists
if (window.BrowserSim && !window.browser) {
  // BrowserSim is a workaround until Conversations is converted to a webextension
  // and has a native `browser` object available.
  window.browser = window.BrowserSim.getBrowser();
}

// If we have a `window.browser` object, we are running as a webextension as opposed to
// running in the browser or in test mode. We suppress certain expected errors when we
// know that we're not a webextension.
export const isWebextension = !!window.browser;

const browser = window.browser || {};

// `i18n` is a replacement for `browser.i18n`.  `getMessage` defaults
// `browser.i18n.getMessage` if the function exists. Otherwise, locale
// information is `fetch`ed and `getMessage` is polyfilled. The `isLoaded`
// promise resolves to `true` when the library has fully loaded.
export const i18n = {
  getMessage: (messageName, substitutions) => `<not loaded>${messageName}`,
  isLoaded: Promise.resolve(true),
  isPolyfilled: true,
};
const ALL_LOCALES = [
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "eu",
  "fi",
  "fr",
  "gl",
  "he-IL",
  "hr",
  "it",
  "ja-JP",
  "lt",
  "nl",
  "pl",
  "pt-BR",
  "rm",
  "ru-RU",
  "sl",
  "sr",
  "sv-SE",
  "tr",
  "uk",
  "zh-CN",
  "zh-TW",
];

/**
 * This function should only be used in the dev frame. It is exported
 * to give the dev frame a way to mock a change to the UI language.
 *
 * @param {*} resolve
 * @param {string} [locale="en"]
 */
export async function initializeI18n(resolve, locale = "en") {
  let resp;
  try {
    resp = await fetch(`../_locales/${locale}/messages.json`);
  } catch (ex) {
    // For tests.
    resp = await fetch(`_locales/${locale}/messages.json`);
  }
  i18n._messages = await resp.json();
  i18n._currentLocale = locale;
  // Replace the `getMessage` function with one that retrieves
  // values from the loaded JSON.
  i18n.getMessage = (messageName, substitutions) => {
    let message =
      (i18n._messages[messageName] || {}).message ||
      `<translation not found>${messageName}`;
    if (!substitutions || !i18n._messages[messageName]) {
      return message;
    }
    // If we're here, we have a valid i18n object and we need to do
    // some substitutions.
    const placeholders = i18n._messages[messageName].placeholders;
    // `placeholders` is an object with keys and values={ content: "$?" }.
    // We need to substitute strings of the form `$key$` with the content at the `$?` position
    // of the `substitutions` array.
    for (const key in placeholders) {
      const index = parseInt(placeholders[key].content.slice(1), 10) - 1;
      message = message.replace(`$${key}$`, substitutions[index]);
    }
    return message;
  };
  i18n.getUILanguage = async () => i18n._currentLocale;
  i18n.getAcceptLanguages = async () => ALL_LOCALES;
  resolve(true);
}

if (browser.i18n) {
  i18n.getMessage = browser.i18n.getMessage;
  i18n.getUILanguage = browser.i18n.getUILanguage;
  i18n.getAcceptLanguages = browser.i18n.getAcceptLanguages;
  i18n.isPolyfilled = false;
} else {
  // Fake what we need from the i18n library
  i18n.isLoaded = new Promise((resolve, reject) => {
    // initializeI18n modifies the global i18n object and calls
    // `resolve(true)` when finished.
    initializeI18n(resolve).catch(reject);
  });

  browser.i18n = i18n;
}

if (!browser.storage) {
  const DEFAULT_PREFS = {
    ...kPrefDefaults,
    // DEFAULT_PREFS is only used when browser.storage does not exist. I.e.,
    // when running in the browser in dev mode. Turn on logging in this case.
    logging_enabled: true,
    expand_who: 4,
    uninstall_infos: "{}",
  };

  // Fake what we need from the browser storage library
  const _stored = { preferences: DEFAULT_PREFS };
  browser.storage = {
    local: {
      async get(key) {
        if (typeof key === "undefined") {
          return _stored;
        }
        if (typeof key === "string") {
          return { [key]: _stored[key] };
        }
        if (Array.isArray(key)) {
          const ret = {};
          for (const k of key) {
            if (k in _stored) {
              ret[k] = _stored[k];
            }
          }
          return ret;
        }
        // the last case is that we are an object with default values
        const ret = {};
        for (const [k, v] of Object.entries(key)) {
          ret[k] = k in _stored ? _stored[k] : v;
        }
        return ret;
      },
      async set(key) {
        return Object.assign(_stored, key);
      },
    },
  };
}

if (!browser.tabs) {
  browser.tabs = {
    async create() {},
    async getCurrent() {
      return {
        id: "135246",
      };
    },
    async remove() {},
  };
}

if (!browser.conversations) {
  browser.conversations = {
    send(details) {
      console.log(details);
    },
    async getLocaleDirection() {
      // RTL languages taken from https://github.com/shadiabuhilal/rtl-detect/blob/master/lib/rtl-detect.js
      const RTL_LANGUAGES = [
        "ae" /* Avestan */,
        "ar" /* 'العربية', Arabic */,
        "arc" /* Aramaic */,
        "bcc" /* 'بلوچی مکرانی', Southern Balochi */,
        "bqi" /* 'بختياري', Bakthiari */,
        "ckb" /* 'Soranî / کوردی', Sorani */,
        "dv" /* Dhivehi */,
        "fa" /* 'فارسی', Persian */,
        "glk" /* 'گیلکی', Gilaki */,
        "he" /* 'עברית', Hebrew */,
        "ku" /* 'Kurdî / كوردی', Kurdish */,
        "mzn" /* 'مازِرونی', Mazanderani */,
        "nqo" /* N'Ko */,
        "pnb" /* 'پنجابی', Western Punjabi */,
        "ps" /* 'پښتو', Pashto, */,
        "sd" /* 'سنڌي', Sindhi */,
        "ug" /* 'Uyghurche / ئۇيغۇرچە', Uyghur */,
        "ur" /* 'اردو', Urdu */,
        "yi" /* 'ייִדיש', Yiddish */,
      ];
      const locale = await i18n.getUILanguage();
      if (locale && RTL_LANGUAGES.some((l) => locale.startsWith(l))) {
        return "rtl";
      }
      return "ltr";
    },
    async getCorePref(name) {
      switch (name) {
        case "mail.showCondensedAddresses":
          return false;
        case "mailnews.mark_message_read.auto":
          return true;
        case "mailnews.mark_message_read.delay":
          return false;
      }
      throw new Error("Unexpected pref");
    },
    async makeFriendlyDateAgo() {
      return "yesterday";
    },
    async formatFileSize(size) {
      return `${size} bars`;
    },
    async makePlural(form, string, count) {
      return `${string} ${count}`;
    },
    async isInView() {
      return true;
    },
    async quoteMsgHdr() {
      return "MsgBody";
    },
    async openAttachment() {},
    async previewAttachment() {},
    async getLateAttachments() {
      return [];
    },
    async parseMimeLine() {
      return [{ email: "", name: "-", fullName: "-" }];
    },
    async convertSnippetToPlainText() {
      return "short snippet";
    },
    async getReplyOnTop() {
      return 1;
    },
  };
}

if (!browser.convCompose) {
  browser.convCompose = {
    send(details) {
      console.log("Sending:", details);
    },
  };
}

if (!browser.convMsgWindow) {
  browser.convMsgWindow = {
    async fireLoadCompleted() {},
  };
}

if (!browser.compose) {
  browser.compose = {
    async beginNew() {},
  };
}

if (!browser.accounts) {
  browser.accounts = {
    async list() {
      return [
        {
          id: "ac1",
          identities: [
            {
              id: `id3`,
              // Intentionally part-upper case to test lower case compare.
              email: `id3@EXAMPLE.com`,
            },
          ],
        },
        {
          id: "ac2",
          identities: [
            {
              id: `id4`,
              email: `id4@example.com`,
            },
          ],
        },
        {
          id: "ac3",
          identities: [
            {
              id: "id5",
              email: "id5@example.com",
            },
          ],
        },
      ];
    },
    async get(id) {
      return {
        id,
        identities: [
          {
            id: `id${id}`,
            email: `${id}@example.com`,
          },
        ],
      };
    },
    async getDefault() {
      return {
        id: "ac1",
        identities: [
          {
            id: `id3`,
            // Intentionally part-upper case to test lower case compare.
            email: `id3@EXAMPLE.com`,
          },
        ],
      };
    },
  };
}

if (!browser.identities) {
  browser.identities = {
    async getDefault(accountId) {
      if (accountId == "ac1") {
        return {
          id: `id3`,
          // Intentionally part-upper case to test lower case compare.
          email: `id3@EXAMPLE.com`,
        };
      } else if (accountId == "ac2") {
        return {
          id: "id4",
          email: "id4@example.com",
        };
      } else if (accountId == "ac34") {
        return {
          id: "idac34",
          email: "ac34@example.com",
        };
      }
      return {
        id: "id5",
        email: "id5@example.com",
      };
    },
  };
}

if (!browser.folders) {
  browser.folders = {
    async getParentFolders(folder) {
      return [
        {
          accountId: folder.accountId,
          name: "Fake",
          path: "/Fake",
        },
      ];
    },
  };
}

if (!browser.messageDisplay) {
  browser.messageDisplay = {
    async getDisplayedMessages(tabId) {
      return [
        {
          author: "author@example.com",
          folder: {
            accountId: "ac34",
            path: "Inbox/test",
          },
          id: 123456,
          read: false,
        },
      ];
    },
  };
}

if (!browser.messages) {
  browser.messages = {
    async listTags() {
      return [
        {
          key: "$label1",
          tag: "Important",
          color: "#ff2600",
          ordinal: "",
        },
        {
          key: "$label2",
          tag: "Work",
          color: "#FF9900",
          ordinal: "",
        },
        {
          color: "#009900",
          key: "$label3",
          ordinal: "",
          tag: "Personal",
        },
      ];
    },
    async get(id) {
      return {};
    },
    async getFull(id) {
      return {
        headers: [],
        parts: [{}],
      };
    },
    async update(id) {},
  };
}

if (!browser.windows) {
  browser.windows = {
    async create() {},
    async getCurrent() {
      return {
        focused: true,
        id: 1,
        tabs: [
          {
            active: true,
            highlighted: true,
            id: 123,
            index: 0,
            selected: true,
          },
        ],
        type: "normal",
      };
    },
  };
}

if (!browser.runtime) {
  browser.runtime = {
    async getPlatformInfo() {
      return {
        os: "win",
      };
    },
    connect() {
      return {};
    },
  };
}

if (!browser.contacts) {
  browser.contacts = {
    async quickSearch(queryInfo) {
      if (
        ["foo@example.com", "bar@example.com"].includes(queryInfo.searchString)
      ) {
        return [
          {
            id: "135246",
            type: "contact",
            properties: {
              PrimaryEmail: "foo@example.com",
              SecondEmail: "bar@example.com",
              DisplayName: "display name",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
        ];
      } else if (queryInfo.searchString == "id4@example.com") {
        return [
          {
            id: "15263748",
            type: "contact",
            properties: {
              PrimaryEmail: "id4@example.com",
              DisplayName: "id4 card",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
        ];
      } else if (queryInfo.searchString == "id5@example.com") {
        return [
          {
            id: "15263748",
            type: "contact",
            properties: {
              PrimaryEmail: "id5@example.com",
              SecondEmail: "id5second@example.com",
              DisplayName: "id5 card",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
        ];
      } else if (queryInfo.searchString == "extra@example.com") {
        return [
          {
            id: "75312468",
            type: "contact",
            properties: {
              PrimaryEmail: "extra@example.com",
              DisplayName: "extra card",
              PreferDisplayName: "0",
              PhotoURI: "https://example.com/fake",
            },
            readOnly: true,
          },
        ];
      } else if (
        ["arch@example.com", "cond@example.com"].includes(
          queryInfo.searchString
        )
      ) {
        return [
          {
            id: "1357924680",
            type: "contact",
            properties: {
              PrimaryEmail: "search@example.com",
              SecondEmail: "second@example.com",
              DisplayName: "search name",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
          {
            id: "3216549870",
            type: "contact",
            properties: {
              PrimaryEmail: "arch@example.com",
              SecondEmail: "other@example.com",
              DisplayName: "arch test",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
          {
            id: "9753124680",
            type: "contact",
            properties: {
              PrimaryEmail: "another@example.com",
              SecondEmail: "cond@example.com",
              DisplayName: "cond test",
              PreferDisplayName: "1",
              PhotoURI: undefined,
            },
          },
        ];
      }
      return [];
    },
    onCreated: {
      addListener() {},
    },
    onUpdated: {
      addListener() {},
    },
    onDeleted: {
      addListener() {},
    },
  };
}

export { browser };
