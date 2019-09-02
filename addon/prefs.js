"use strict";

/* eslint-env webextensions */

const kCurrentLegacyMigration = 1;

// XXX This list should be kept in sync with the one in options.js.
const kPrefDefaults = {
  "hide_quote_length": 5,
  "expand_who": 4, // kExpandAuto
  "monospaced_senders": "bugzilla-daemon@mozilla.org",
  "no_friendly_date": false,
  "uninstall_infos": "{}",
  "logging_enabled": false,
  "tweak_bodies": true,
  "tweak_chrome": true,
  "operate_on_conversations": false,
  "enabled": true,
  "extra_attachments": false,
  "compose_in_tab": true,
  "unwanted_recipients": "{}",
  "hide_sigs": false,
  "keybindings": "",
};

browser.storage.local.get("preferences").then(async results => {
  if (!results.preferences ||
      !results.preferences.migratedLegacy ||
      results.preferences.migratedLegacy != kCurrentLegacyMigration) {
    const prefs = {
      migratedLegacy: kCurrentLegacyMigration,
    };

    for (const prefName of Object.getOwnPropertyNames(kPrefDefaults)) {
      prefs[prefName] = await browser.conversations.getPref(prefName);
    }
    browser.storage.local.set({preferences: prefs}).catch(console.error);
  }
}).catch(ex => {
  console.error(ex);
}).then(() => {
  browser.storage.onChanged.addListener((changed, areaName) => {
    if (areaName != "local" || !("preferences" in changed)) {
      return;
    }
    for (const prefName of Object.getOwnPropertyNames(changed.preferences.newValue)) {
      if (changed.preferences.oldValue[prefName] !=
          changed.preferences.newValue[prefName]) {
        browser.conversations.setPref(prefName, changed.preferences.newValue[prefName]);
      }
    }
  });
});
