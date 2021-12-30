/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

/* eslint-disable no-unused-vars */
XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  // Conversation: "chrome://conversations/content/modules/conversation.js",
});
/* eslint-enable no-unused-vars */

globalThis.conversationStore = {
  pendingActions: [],

  dispatch(action) {
    console.log("old dispatch");
    this.pendingActions.push(action);
  },
};

globalThis.conversationSummaryActions = {};
