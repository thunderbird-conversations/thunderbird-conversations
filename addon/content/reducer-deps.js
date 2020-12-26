/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

let oldPrint = window.print;

export async function initialize() {
  // This provides simulation for the WebExtension environment whilst we're still
  // being loaded in a privileged process.
  // eslint-disable-next-line
  globalThis.browser = await BrowserSim.getBrowserAsync();
  globalThis.print = printConversation;
}

/* global Conversations */

function printConversation(event) {
  for (let { message: m } of Conversations.currentConversation.messages) {
    m.dumpPlainTextForPrinting();
  }
  oldPrint();
}
