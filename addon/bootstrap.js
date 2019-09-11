/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported startup, shutdown, install, uninstall */

"use strict";

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  Conversation: "resource://conversations/modules/conversation.js",
  // CustomizeKeys: "resource://conversations/modules/keycustomization.js",
  GlodaAttrProviders: "resource://conversations/modules/plugins/glodaAttrProviders.js",
  MonkeyPatch: "resource://conversations/modules/monkeypatch.js",
  Services: "resource://gre/modules/Services.jsm",
});

let Log;

// from wjohnston (cleary for Fennec)
let ResourceRegister = {
  init(aURI, aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    let alias = Services.io.newURI(aURI);
    resource.setSubstitution(aName, alias);
  },

  uninit(aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    resource.setSubstitution(aName, null);
  },
};

function monkeyPatchWindow(window) {
  let doIt = function() {
    try {
      if (window.document.location != "chrome://messenger/content/messenger.xul")
        return;
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

        quickCompose() {},

        createDraftListenerArrayForId(aId) {
          window.Conversations.draftListeners[aId] = [];
        },
      };

      // We instantiate the Monkey-Patch for the given Conversation object.
      let monkeyPatch = new MonkeyPatch(window, Conversation);
      // And then we seize the window and insert our code into it
      monkeyPatch.apply();

      // Used by the in-stub.html detachTab function
      window.Conversations.monkeyPatch = monkeyPatch;

      window.Conversations.quickCompose = function() {
        const {Prefs} = ChromeUtils.import("resource://conversations/modules/prefs.js");
        if (Prefs.compose_in_tab)
          window.openTab("chromeTab", { chromePage: "chrome://conversations/content/stub.xhtml?quickCompose=1" });
        else
          window.open("chrome://conversations/content/stub.xhtml?quickCompose=1", "", "chrome,width=1020,height=600");
      };

      // The modules below need to be loaded when a window exists, i.e. after
      // overlays have been properly loaded and applied
      /* eslint-disable no-unused-vars */
      ChromeUtils.import("resource://conversations/modules/plugins/enigmail.js");
      ChromeUtils.import("resource://conversations/modules/plugins/lightning.js");
      ChromeUtils.import("resource://conversations/modules/plugins/dkimVerifier.js");
      /* eslint-enable no-unused-vars */
    } catch (e) {
      Cu.reportError(e);
    }
  };

  if (window.document.readyState == "complete") {
    Log.debug("Document is ready...");
    doIt();
  } else {
    Log.debug(`Document is not ready (${window.document.readyState}), waiting...`);
    window.addEventListener("load", () => {
      doIt();
    }, {once: true});
  }
}

function monkeyPatchAllWindows() {
  for (let w of Services.wm.getEnumerator("mail:3pane"))
    monkeyPatchWindow(w);
}

// This obserer is notified when a new window is created and injects our code
let windowObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      if (aSubject && ("QueryInterface" in aSubject)) {
        aSubject.QueryInterface(Ci.nsIDOMWindow);
        monkeyPatchWindow(aSubject.window);
      }
    }
  },
};

function startup(aData, aReason) {
  ResourceRegister.init(aData.resourceURI.spec, "conversations");
  const {setupLogging, dumpCallStack} = ChromeUtils.import("resource://conversations/modules/log.js");
  const {Config} = ChromeUtils.import("resource://conversations/modules/config.js");

  Log = setupLogging("Conversations.MonkeyPatch");
  Log.debug("startup, aReason=", aReason);

  try {
    // Patch all existing windows when the UI is built; all locales should have been loaded here
    // Hook in the embedding and gloda attribute providers.
    GlodaAttrProviders.init();
    monkeyPatchAllWindows();

    // Patch all future windows
    Services.ww.registerNotification(windowObserver);

    // Show the assistant if the extension is installed or enabled
    if (aReason == Config.BOOTSTRAP_REASONS.ADDON_INSTALL || aReason == Config.BOOTSTRAP_REASONS.ADDON_ENABLE) {
      Services.ww.openWindow(
        null,
        "chrome://conversations/content/assistant/assistant.xhtml",
        "",
        "chrome,width=800,height=500", {});
    }

    // Hook into options window
    // TODO: Maybe bring this back?
    // Services.obs.addObserver({
    //   observe(aSubject, aTopic, aData) {
    //     if (aTopic == "addon-options-displayed" && aData == "gconversation@xulforum.org") {
    //       CustomizeKeys.enable(aSubject); // aSubject is the options document
    //     }
    //   },
    // }, "addon-options-displayed");
    // Services.obs.addObserver({
    //   observe(aSubject, aTopic, aData) {
    //     if (aTopic == "addon-options-hidden" && aData == "gconversation@xulforum.org") {
    //       CustomizeKeys.disable(aSubject); // aSubject is the options document
    //     }
    //   },
    // }, "addon-options-hidden");
  } catch (e) {
    Cu.reportError(e);
    dumpCallStack(e);
  }
}

function shutdown(aData, aReason) {
  const {SimpleStorage} = ChromeUtils.import("resource://conversations/modules/stdlib/SimpleStorage.js");
  const {Config} = ChromeUtils.import("resource://conversations/modules/config.js");
  SimpleStorage.close().catch(Cu.reportError);

  // No need to do extra work here
  Log.debug("shutdown, aReason=", aReason);
  if (aReason == Config.BOOTSTRAP_REASONS.APP_SHUTDOWN)
    return;

  Services.ww.unregisterNotification(windowObserver);

  // Reasons to be here can be DISABLE or UNINSTALL
  ResourceRegister.uninit("conversations");
  for (let w of Services.wm.getEnumerator("mail:3pane")) {
    if ("Conversations" in w) {
      w.Conversations.monkeyPatch.undo(aReason);
    }
  }
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}
