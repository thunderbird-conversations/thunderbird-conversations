/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prefs } from "./prefs.js";
import { UIHandler } from "./uiHandler.js";
import { Window } from "./window.js";

class Background {
  constructor() {
    this._prefs = new Prefs();
    this._uiHandler = new UIHandler();
    this._window = new Window();
  }
  async init() {
    // Setup the temporary API caller that stub.xhtml uses.
    // Do this first to ensure it is set before bootstrap fires after
    // preference startup.
    browser.conversations.onCallAPI.addListener(
      async (apiName, apiItem, args) => {
        if (apiName.startsWith("_")) {
          return this[apiName][apiItem](...args);
        }
        return browser[apiName][apiItem](...args);
      }
    );

    await this._prefs.init();
    await this._uiHandler.init();
    await this._window.init();

    // Reset the message pane if the font size is changed, that seems to be
    // the best we can do at the moment, as the message pane doesn't get
    // told otherwise.
    browser.conversations.onCorePrefChanged.addListener(() => {
      browser.conversations.resetMessagePane().catch(console.error);
    }, "font.size.variable.x-western");

    browser.conversations.onSetConversationPreferences.addListener(() => {});
  }
}

let background = new Background();
background.init().catch(console.error);

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason == "install") {
    browser.tabs.create({
      url: "assistant/assistant.html",
    });
  } else if (
    details.reason == "update" &&
    !details.previousVersion.startsWith("3.1.")
  ) {
    // Hopefully just needed for 3.0.x to 3.1.x upgrade to ensure the cache
    // is invalidated to work around previous issues with the startup cache
    // caching jsms that we didn't want it to.
    browser.conversations.invalidateCache().catch(console.error);
  }
});
