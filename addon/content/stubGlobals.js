/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

/* eslint-disable no-unused-vars */
XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  Conversation: "chrome://conversations/content/modules/conversation.js",
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
});
/* eslint-enable no-unused-vars */

globalThis.conversationStore = {
  dispatch() {
    console.log("old dispatch");
  },
};

globalThis.conversationSummaryActions = {};

/* exported conversationDispatch */
function conversationDispatch(...args) {
  globalThis.conversationStore.dispatch(...args);
}
