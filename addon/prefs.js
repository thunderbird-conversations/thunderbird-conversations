/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const kCurrentLegacyMigration = 1;

export const kPrefDefaults = {
  hide_quote_length: 5,
  expand_who: 4, // kExpandAuto
  monospaced_senders: "bugzilla-daemon@mozilla.org",
  no_friendly_date: false,
  uninstall_infos: "{}",
  logging_enabled: false,
  tweak_bodies: true,
  tweak_chrome: true,
  operate_on_conversations: false,
  enabled: true,
  extra_attachments: false,
  compose_in_tab: true,
  unwanted_recipients: "{}",
  hide_sigs: false,
};

export class Prefs {
  async init() {
    try {
      await this._migrate();
    } catch (ex) {
      console.log(ex);
    }

    this._addListener();
  }

  async _migrate() {
    const results = await browser.storage.local.get("preferences");

    if (
      !results.preferences ||
      !results.preferences.migratedLegacy ||
      results.preferences.migratedLegacy != kCurrentLegacyMigration
    ) {
      const prefs = {
        migratedLegacy: kCurrentLegacyMigration,
      };

      for (const prefName of Object.getOwnPropertyNames(kPrefDefaults)) {
        prefs[prefName] = await browser.conversations.getPref(prefName);
      }
      browser.storage.local.set({ preferences: prefs }).catch(console.error);
    }
  }

  _addListener() {
    browser.storage.onChanged.addListener((changed, areaName) => {
      if (areaName != "local" || !("preferences" in changed)) {
        return;
      }
      for (const prefName of Object.getOwnPropertyNames(
        changed.preferences.newValue
      )) {
        if (prefName == "migratedLegacy") {
          continue;
        }
        if (
          !changed.preferences.oldValue ||
          changed.preferences.oldValue[prefName] !=
            changed.preferences.newValue[prefName]
        ) {
          browser.conversations.setPref(
            prefName,
            changed.preferences.newValue[prefName]
          );
        }
      }
    });
  }
}
