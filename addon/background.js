/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prefs } from "./prefs.js";

class Background {
  constructor() {
    this._prefs = new Prefs();
  }
  async init() {
    await this._prefs.init();
  }
}

let background = new Background();
background.init().catch(console.error);

browser.runtime.onInstalled.addListener(details => {
  if (details.reason == "install") {
    browser.tabs.create({
      url: "assistant/assistant.html",
    });
  }
});
