/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported startup, shutdown, install, uninstall */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  GlodaAttrProviders:
    "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
  MonkeyPatch: "chrome://conversations/content/modules/monkeypatch.js",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
});

let Log;

function monkeyPatchWindow(window) {
  let doIt = function() {
    try {
      if (
        window.document.location != "chrome://messenger/content/messenger.xul"
      ) {
        return;
      }
      Log.debug("The window looks like a mail:3pane, monkey-patching...");

      // Insert our own global Conversations object
      window.Conversations = {
        // These two belong here, use getMail3Pane().Conversations to access them
        monkeyPatch: null,
        // key: Message-ID
        // value: a list of listeners
        msgListeners: {},
        // key: Gloda Conversation ID
        // value: a list of listeners that have a onDraftChanged method
        draftListeners: {},

        // These two are replicated in the case of a conversation tab, so use
        //  Conversation._window.Conversations to access the right instance
        currentConversation: null,
        counter: 0,

        createDraftListenerArrayForId(aId) {
          window.Conversations.draftListeners[aId] = [];
        },
      };

      // We instantiate the Monkey-Patch for the given Conversation object.
      let monkeyPatch = new MonkeyPatch(window);
      // And then we seize the window and insert our code into it
      monkeyPatch.apply();

      // Used by the in-stub.html detachTab function
      window.Conversations.monkeyPatch = monkeyPatch;

      // The modules below need to be loaded when a window exists, i.e. after
      // overlays have been properly loaded and applied
      /* eslint-disable no-unused-vars */
      ChromeUtils.import(
        "chrome://conversations/content/modules/plugins/enigmail.js"
      );
      ChromeUtils.import(
        "chrome://conversations/content/modules/plugins/lightning.js"
      );
      ChromeUtils.import(
        "chrome://conversations/content/modules/plugins/dkimVerifier.js"
      );
      monkeyPatch.finishedStartup = true;
      /* eslint-enable no-unused-vars */
    } catch (e) {
      Cu.reportError(e);
    }
  };

  if (window.document.readyState == "complete") {
    Log.debug("Document is ready...");
    doIt();
  } else {
    Log.debug(
      `Document is not ready (${window.document.readyState}), waiting...`
    );
    window.addEventListener(
      "load",
      () => {
        doIt();
      },
      { once: true }
    );
  }
}

function monkeyPatchAllWindows() {
  for (let w of Services.wm.getEnumerator("mail:3pane")) {
    monkeyPatchWindow(w);
  }
}

// This obserer is notified when a new window is created and injects our code
let windowObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      if (aSubject && "QueryInterface" in aSubject) {
        aSubject.QueryInterface(Ci.nsIDOMWindow);
        monkeyPatchWindow(aSubject.window);
      }
    }
  },
};

async function startup(aData, aReason) {
  await Prefs.initialized;

  const { setupLogging, dumpCallStack } = ChromeUtils.import(
    "chrome://conversations/content/modules/log.js"
  );

  Log = setupLogging("Conversations.MonkeyPatch");
  Log.debug("startup, aReason=", aReason);

  try {
    // Patch all existing windows when the UI is built; all locales should have been loaded here
    // Hook in the embedding and gloda attribute providers.
    GlodaAttrProviders.init();
    monkeyPatchAllWindows();

    // Patch all future windows
    Services.ww.registerNotification(windowObserver);
  } catch (e) {
    Cu.reportError(e);
    dumpCallStack(e);
  }
}

function shutdown(aData, aReason) {
  const { Config } = ChromeUtils.import(
    "chrome://conversations/content/modules/config.js"
  );

  // No need to do extra work here
  // Log.debug("shutdown, aReason=", aReason);
  if (aReason == Config.BOOTSTRAP_REASONS.APP_SHUTDOWN) {
    return;
  }

  Services.ww.unregisterNotification(windowObserver);

  // Reasons to be here can be DISABLE or UNINSTALL
  for (let w of Services.wm.getEnumerator("mail:3pane")) {
    if ("Conversations" in w) {
      w.Conversations.monkeyPatch.undo(aReason);
    }
  }
}

function install(aData, aReason) {}

function uninstall(aData, aReason) {}
