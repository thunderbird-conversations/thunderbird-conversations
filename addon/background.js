/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prefs } from "./prefs.js";
import { Window } from "./window.js";

class Background {
  constructor() {
    this._prefs = new Prefs();
    this._keyHandler = new KeyHandler();
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
    await this._keyHandler.init();
    await this._window.init();

    // Reset the message pane if the font size is changed, that seems to be
    // the best we can do at the moment, as the message pane doesn't get
    // told otherwise.
    browser.conversations.onCorePrefChanged.addListener(() => {
      browser.conversations.resetMessagePane().catch(console.error);
    }, "font.size.variable.x-western");
  }
}

class KeyHandler {
  init() {
    browser.commands.onCommand.addListener((command) => {
      if (command == "quick_compose") {
        console.warn("Quick Compose is currently disabled");
        // The title/description for this pref is really confusing, we should
        // reconsider it when we re-enable.
        // if (Prefs.compose_in_tab) {
        //   window.openTab("chromeTab", {
        //     chromePage:
        //       "chrome://conversations/content/stub.xhtml?quickCompose=1",
        //   });
        // } else {
        //   window.open(
        //     "chrome://conversations/content/stub.xhtml?quickCompose=1",
        //     "",
        //     "chrome,width=1020,height=600"
        //   );
        // }
      }
    });
  }
}

let background = new Background();
background.init().catch(console.error);

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason == "install") {
    browser.tabs.create({
      url: "assistant/assistant.html",
    });
  }
});
