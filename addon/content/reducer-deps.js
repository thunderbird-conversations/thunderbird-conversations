/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Conversations */
// eslint-disable-next-line no-redeclare
/* exported XPCOMUtils, browser, initialize */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
});

let browser;

async function initialize() {
  // This provides simulation for the WebExtension environment whilst we're still
  // being loaded in a privileged process.
  // eslint-disable-next-line
  browser = await BrowserSim.getBrowserAsync();
}

let oldPrint = window.print;

function printConversation(event) {
  for (let { message: m } of Conversations.currentConversation.messages) {
    m.dumpPlainTextForPrinting();
  }
  oldPrint();
}

window.print = printConversation;
