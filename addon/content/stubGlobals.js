/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported BrowserSim */
// eslint-disable-next-line no-unused-vars
ChromeUtils.defineModuleGetter(
  this,
  "BrowserSim",
  "chrome://conversations/content/modules/browserSim.js"
);

globalThis.conversationStore = {
  pendingActions: [],

  dispatch(action) {
    console.log("old dispatch");
    this.pendingActions.push(action);
  },
};
