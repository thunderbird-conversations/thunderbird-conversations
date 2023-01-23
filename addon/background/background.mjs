/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assistant } from "./assistant.mjs";
import { contactManager } from "./contactManager.mjs";
import { Prefs } from "./prefs.mjs";
import { UIHandler } from "./uiHandler.mjs";
import { Window } from "./window.mjs";

const requestHandlers = [];

/**
 * The initial background handler, responsible for setting up other background
 * objects.
 */
class Background {
  constructor() {
    this._assistant = new Assistant();
    this._prefs = new Prefs();
    this._uiHandler = new UIHandler();
    this._window = new Window();
    this._background = {
      // This is a special method to allow the background script to send messages to itself.
      // It is needed because we're not a full webextension yet. Basically, to imitate access
      // to the `browser` object, we pass around the background scripts `browser` object. That
      // means we cannot use `postMessage` from the "content script" to send the background
      // script data because there is effectively no content script.
      async request(message) {
        // Send the request to all request handlers and return the first one that gives
        // a non-null response.
        return (
          await Promise.all(requestHandlers.map((handler) => handler(message)))
        ).find((response) => response != null);
      },
    };
  }
  async init() {
    await this._assistant.init();
    await this._prefs.init();
    await this._uiHandler.init();
    await this._window.init();
    contactManager.init();

    // Reset the message pane if the font size is changed, that seems to be
    // the best we can do at the moment, as the message pane doesn't get
    // told otherwise.
    browser.conversations.onCorePrefChanged.addListener(() => {
      browser.conversations.resetMessagePane().catch(console.error);
    }, "font.size.variable.x-western");

    browser.conversations.onSetConversationPreferences.addListener(() => {});

    // Setup the temporary API caller that stub.html uses.
    // Do this at the end so that everything is ready before stub.js starts.
    browser.conversations.onCallAPI.addListener(
      async (apiName, apiItem, args) => {
        if (apiName.startsWith("_")) {
          return this[apiName][apiItem](...args);
        }
        return browser[apiName][apiItem](...args);
      }
    );
  }
}

let background = new Background();
background.init().catch(console.error);

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason == "install") {
    browser.tabs.create({
      url: "../assistant/assistant.html",
    });
  } else if (details.reason == "update") {
    // Hopefully just needed whilst we still have jsms to ensure the cache
    // is invalidated to work around previous issues with the startup cache
    // caching jsms that we didn't want it to.
    browser.conversations.invalidateCache().catch(console.error);
  }
});

// Request handler for getting contact details.
// Accessible through browser._background.request({ type: "contactDetails", payload: contact })
requestHandlers.push(async (msg) => {
  switch (msg.type) {
    case "contactDetails":
      return contactManager.get(msg.payload.email);
  }
  return null;
});
