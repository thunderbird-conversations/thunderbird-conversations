/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// A compatability layer that can be imported whether in the browser or
// in Thunderbird

import { kPrefDefaults } from "../../prefs.js";

// Make sure the browser object exists
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
    const resp = await fetch("_locales/en/messages.json");
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

export { browser };
