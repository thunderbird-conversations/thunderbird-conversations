/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { jest } from "@jest/globals";
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("init", () => {
    test("Should initialise data to a reasonable default", async () => {
      await prefs.init();

      expect(await browser.storage.local.get("preferences")).toStrictEqual({
        preferences: kPrefDefaults,
      });
    });

    test("Should upgrade older preferences", async () => {
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
      expect(stored.migratedLegacy).toStrictEqual(kCurrentLegacyMigration);
      expect(stored.hide_quick_reply).toStrictEqual(false);
      expect(stored.no_friendly_date).toStrictEqual(true);
      expect(stored.compose_in_tab).toStrictEqual(false);
    });
  });
});
