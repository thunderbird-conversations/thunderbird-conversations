/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export class UIHandler {
  init() {
    browser.commands.onCommand.addListener(this.onKeyCommand.bind(this));
  }

  onKeyCommand(command) {
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
  }
}
