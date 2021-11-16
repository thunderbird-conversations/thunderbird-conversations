/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser as CompatBrowser } from "../content/es-modules/thunderbird-compat.js";

if (!globalThis.browser) {
  globalThis.browser = CompatBrowser;
}

/**
 * This class handles setting up hooks into the Thunderbird UI for display of
 * columns, handling key presses etc.
 */
export class UIHandler {
  init() {
    browser.commands.onCommand.addListener(this.onKeyCommand.bind(this));
    browser.convContacts.onColumnHandler.addListener(
      () => {},
      browser.i18n.getMessage("between.columnName"),
      browser.i18n.getMessage("between.columnTooltip"),
      browser.i18n.getMessage("message.meBetweenMeAndSomeone"),
      browser.i18n.getMessage("message.meBetweenSomeoneAndMe"),
      browser.i18n.getMessage("header.commaSeparator"),
      browser.i18n.getMessage("header.andSeparator")
    );
  }

  onKeyCommand(command) {
    if (command == "quick_compose") {
      this.openQuickCompose().catch(console.error);
    }
  }

  async openQuickCompose() {
    let win = await browser.windows.getCurrent({ populate: true });
    let identityId;
    if (win.type == "normal") {
      let [tab] = win.tabs.filter((t) => t.active);
      if (tab) {
        let msgs = await browser.messageDisplay.getDisplayedMessages(tab.id);
        if (msgs && msgs.length) {
          let accountDetail = await browser.accounts.get(
            msgs[0].folder.accountId
          );
          let identity = await browser.identities.getDefault(accountDetail.id);
          if (identity) {
            identityId = identity.id;
          }
        }
      }
    }
    if (!identityId) {
      identityId = await this.getDefaultIdentity();
    }
    // The title/description for this pref is really confusing, we should
    // reconsider it when we re-enable.
    const result = await browser.storage.local.get("preferences");
    const url = `../compose/compose.html?identityId=${identityId}`;
    if (result.preferences.compose_in_tab) {
      browser.tabs.create({
        url,
      });
    } else {
      browser.windows.create({
        url,
        type: "popup",
        width: 1024,
        height: 600,
      });
    }
  }

  async getDefaultIdentity() {
    let defaultAccount = await browser.accounts.getDefault();
    let identity = await browser.identities.getDefault(defaultAccount.id);
    return identity.id;
  }
}
