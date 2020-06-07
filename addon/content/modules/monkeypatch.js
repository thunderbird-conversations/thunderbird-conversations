/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MonkeyPatch"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Customizations: "chrome://conversations/content/modules/assistant.js",
  getMail3Pane: "chrome://conversations/content/modules/misc.js",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
});

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.MonkeyPatch");
});

let shouldPerformUninstall;

function MonkeyPatch(window, windowId) {
  this._window = window;
  this._windowId = windowId;
  this._beingUninstalled = false;
  this._undoFuncs = [];
}

MonkeyPatch.prototype = {
  pushUndo(f) {
    this._undoFuncs.push(f);
  },

  undo(aReason) {
    let f;
    while ((f = this._undoFuncs.pop())) {
      try {
        f(aReason);
      } catch (ex) {
        console.error("Failed to undo some customization", ex);
      }
    }
  },

  registerUndoCustomizations() {
    shouldPerformUninstall = true;

    this.pushUndo((aReason) => {
      // We don't want to undo all the customizations in the case of an
      // upgrade... but if the user disables the conversation view, or
      // uninstalls the addon, then we should revert them indeed.
      if (shouldPerformUninstall) {
        // Switch to a 3pane view (otherwise the "display threaded"
        // customization is not reverted)
        let mainWindow = getMail3Pane();
        let tabmail = mainWindow.document.getElementById("tabmail");
        if (tabmail.tabContainer.selectedIndex != 0) {
          tabmail.tabContainer.selectedIndex = 0;
        }
        this.undoCustomizations();
        // Since this is called once per window, we don't want to uninstall
        // multiple times...
        shouldPerformUninstall = false;
      }
    });
  },

  undoCustomizations() {
    let uninstallInfos = JSON.parse(Prefs.uninstall_infos);
    for (let [k, v] of Object.entries(Customizations)) {
      if (k in uninstallInfos) {
        try {
          Log.debug("Uninstalling", k, uninstallInfos[k]);
          v.uninstall(uninstallInfos[k]);
        } catch (ex) {
          console.error("Failed to uninstall", k, ex);
        }
      }
    }
    // TODO: We may need to fix this to pass data back to local storage, but
    // generally if we're being uninstalled, we'll be removing the local storage
    // anyway, so maybe this is ok? Or do we need to handle the disable case?
    // Prefs.setString("conversations.uninstall_infos", "{}");
  },

  async apply() {
    // Undo all our customizations at uninstall-time
    this.registerUndoCustomizations();

    Log.debug("Monkey patch successfully applied.");
  },
};
