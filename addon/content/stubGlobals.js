/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported BrowserSim */
ChromeUtils.defineESModuleGetters(this, {
  BrowserSim:
    "chrome://conversations/content/modules/BrowserSim.sys.mjs?rand=" +
    Services.prefs.getCharPref(
      "extensions.thunderbirdconversations.browserSim"
    ),
});

this.gMessageSummary = {
  clear() {},
};
