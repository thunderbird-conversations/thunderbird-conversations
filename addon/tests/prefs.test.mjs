/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  Prefs,
  kPrefDefaults,
  kCurrentLegacyMigration,
} from "../background/prefs.mjs";

describe("Prefs tests", () => {
  let prefs;

  beforeEach(() => {
    prefs = new Prefs();
  });

  describe("init", () => {
    it("Should initialise data to a reasonable default", async () => {
      await prefs.init();

      assert.deepEqual(await browser.storage.local.get("preferences"), {
        preferences: kPrefDefaults,
      });
    });

    it("Should upgrade older preferences", async () => {
      let newPrefs = {
        ...kPrefDefaults,
        no_friendly_date: true,
        compose_in_tab: false,
      };
      delete newPrefs.hide_quick_reply;
      newPrefs.migratedLegacy = 2;
      await browser.storage.local.set({ preferences: newPrefs });

      await prefs.init();

      let stored = (await browser.storage.local.get("preferences")).preferences;
      assert.strictEqual(stored.migratedLegacy, kCurrentLegacyMigration);
      assert.strictEqual(stored.hide_quick_reply, false);
      assert.strictEqual(stored.no_friendly_date, true);
      assert.strictEqual(stored.compose_in_tab, false);
    });
  });
});
