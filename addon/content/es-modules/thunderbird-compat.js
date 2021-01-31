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

if (browser.i18n) {
  i18n.getMessage = browser.i18n.getMessage;
  i18n.isPolyfilled = false;
} else {
  async function initializeI18n(resolve) {
    let resp;
    try {
      resp = await fetch("../_locales/en/messages.json");
    } catch (ex) {
      // For tests.
      resp = await fetch("_locales/en/messages.json");
    }
    const json = await resp.json();
    // Replace the `getMessage` function with one that retrieves
    // values from the loaded JSON.
    i18n.getMessage = (messageName, substitutions) =>
      (json[messageName] || {}).message ||
      `<translation not found>${messageName}`;
    resolve(true);
  }

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
    undoCustomizations() {},
    send(details) {
      console.log(details);
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

if (!browser.accounts) {
  browser.accounts = {
    async list() {
      return [
        {
          id: "ac1",
          identities: [
            {
              id: `id3`,
              email: `id3@example.com`,
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
    async setDefaultIdentity() {},
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
  };
}

export { browser };
