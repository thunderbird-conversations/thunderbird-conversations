/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
    // Thunderbird 76+ only.
    if ("setDefaultIdentity" in browser.accounts) {
      // The title/description for this pref is really confusing, we should
      // reconsider it when we re-enable.
      const result = await browser.storage.local.get("preferences");

      if (result.preferences.compose_in_tab) {
        browser.tabs.create({
          url: "compose/compose.html",
        });
      } else {
        browser.windows.create({
          url: "compose/compose.html",
          type: "popup",
          width: 1024,
          height: 600,
        });
      }
    }
  }
}
