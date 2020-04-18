/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const kCurrentLegacyMigration = 2;

export const kPrefDefaults = {
  hide_quote_length: 5,
  expand_who: 4, // kExpandAuto
  no_friendly_date: false,
  uninstall_infos: "{}",
  logging_enabled: false,
  tweak_bodies: true,
  tweak_chrome: true,
  operate_on_conversations: false,
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
      console.error(ex);
    }

    // Now we've done the migration, tell the backend about all our prefs.
    const results = await browser.storage.local.get("preferences");
    if (results.preferences) {
      let updatePrefs = false;
      for (const prefName of Object.getOwnPropertyNames(kPrefDefaults)) {
        // Ensure all preference values are defined.
        if (results.preferences[prefName] === "undefined") {
          updatePrefs = true;
          results.preferences[prefName] = kPrefDefaults[prefName];
        }
        await browser.conversations.setPref(
          prefName,
          results.preferences[prefName]
        );
      }
      // Set a special pref so bootstrap knows it can continue.
      await browser.conversations.setPref("finishedStartup", true);

      if (updatePrefs) {
        try {
          await browser.storage.local.set({ preferences: results.preferences });
        } catch (ex) {
          console.error(ex);
        }
      }
    } else {
      console.error("Could not find the preferences to send to the API.");
    }

    this._addListener();
  }

  async _migrate() {
    const results = await browser.storage.local.get("preferences");

    const currentMigration =
      results.preferences && results.preferences.migratedLegacy
        ? results.preferences.migratedLegacy
        : 0;

    if (currentMigration >= kCurrentLegacyMigration) {
      return;
    }

    let prefs = results.preferences || {};

    if (currentMigration < 1) {
      for (const prefName of Object.getOwnPropertyNames(kPrefDefaults)) {
        prefs[prefName] = await browser.conversations.getPref(prefName);
        if (prefs[prefName] === undefined) {
          prefs[prefName] = kPrefDefaults[prefName];
        }
      }
    }

    if (currentMigration < 2) {
      try {
        const legacyData = await browser.conversations.getLegacyStorageData();
        if (legacyData && legacyData.length) {
          await browser.storage.local.set({ draftsData: legacyData });
          // Stored in key/value format.
          // The key is the gloda id. The value was generated from this:
          // {
          //   msgUri: msgHdrGetUri(gComposeSession.params.msgHdr),
          //   from: gComposeSession.params.identity.email,
          //   to: JSON.parse($("#to").val()).join(","),
          //   cc: JSON.parse($("#cc").val()).join(","),
          //   bcc: JSON.parse($("#bcc").val()).join(","),
          //   body: getActiveEditor().value,
          //   attachments: gComposeSession.attachmentList.save()
          // }
        }
      } catch (ex) {
        console.error("Couldn't migrate data: " + ex);
      }
    }

    prefs.migratedLegacy = kCurrentLegacyMigration;
    await browser.storage.local.set({ preferences: prefs });
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
