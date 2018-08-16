/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* exported startup, shutdown, install, uninstall */

"use strict";

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
const {fixIterator} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm", {});

let global = this;
let Log;

// from wjohnston (cleary for Fennec)
let ResourceRegister = {
  init(aFile, aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    let alias = Services.io.newFileURI(aFile);
    if (!aFile.isDirectory()) {
      alias = Services.io.newURI("jar:" + alias.spec + "!/");
    }
    resource.setSubstitution(aName, alias);
  },

  uninit(aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    resource.setSubstitution(aName, null);
  }
};

function monkeyPatchWindow(window, aLater) {
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
        if (Prefs.compose_in_tab)
          window.openTab("chromeTab", { chromePage: "chrome://conversations/content/stub.xhtml?quickCompose=1" });
        else
          window.open("chrome://conversations/content/stub.xhtml?quickCompose=1", "", "chrome,width=1020,height=600");
      };

      // The modules below need to be loaded when a window exists, i.e. after
      // overlays have been properly loaded and applied
      ChromeUtils.import("resource://conversations/modules/plugins/enigmail.js");
      ChromeUtils.import("resource://conversations/modules/plugins/lightning.js");
      ChromeUtils.import("resource://conversations/modules/plugins/dkimVerifier.js");
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
  };

  if (aLater)
    window.addEventListener("load", function tmp() {
      window.removeEventListener("load", tmp);
      doIt();
    });
  else
    doIt();
}

function monkeyPatchAllWindows() {
  for (let w of fixIterator(Services.wm.getEnumerator("mail:3pane")))
    monkeyPatchWindow(w, false);
}

/* We don't load all imports at initialization time because of bug #622:
 * Some of these imports import gloda/public.js, gloda/index_msg.js or gloda/index_msg.js.
 * These trigger some code which loads the language strings for some folders ("inbox", "sent", etc.)
 * before other locales were loaded. The result were some English strings although another locale was selected.
 *
 * Cu.import() just loads every imported file once, so there is no need for a guard (like if(!isLoaded){...})
 */
function loadImports() {
  /* import-globals-from modules/monkeypatch.js */
  ChromeUtils.import("resource://conversations/modules/monkeypatch.js", global);
  ChromeUtils.import("resource://conversations/modules/prefs.js", global);
  /* import-globals-from modules/conversation.js */
  ChromeUtils.import("resource://conversations/modules/conversation.js", global);
  /* import-globals-from modules/keycustomization.js */
  ChromeUtils.import("resource://conversations/modules/keycustomization.js", global);

  ChromeUtils.import("resource://conversations/modules/plugins/glodaAttrProviders.js");
  ChromeUtils.import("resource://conversations/modules/plugins/embeds.js");
}

// This obserer is notified when a new window is created and injects our code
let windowObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      loadImports();
      aSubject.QueryInterface(Ci.nsIDOMWindow);
      monkeyPatchWindow(aSubject.window, true);
    }
  }
};

function startup(aData, aReason) {
  ResourceRegister.init(aData.installPath, "conversations");
  /* import-globals-from modules/log.js */
  ChromeUtils.import("resource://conversations/modules/log.js", global);
  /* import-globals-from modules/prefs.js */
  ChromeUtils.import("resource://conversations/modules/prefs.js", global);
  /* import-globals-from modules/config.js */
  ChromeUtils.import("resource://conversations/modules/config.js", global);

  Log = setupLogging("Conversations.MonkeyPatch");
  Log.debug("startup, aReason=", aReason);

  try {
    // Patch all existing windows when the UI is built; all locales should have been loaded here
    Services.obs.addObserver({
      observe(aSubject, aTopic, aData) {
          loadImports();
          monkeyPatchAllWindows();
      }
    }, "final-ui-startup");


    // Patch all future windows
    Services.ww.registerNotification(windowObserver);

    // Show the assistant if the extension is installed or enabled
    if (aReason == BOOTSTRAP_REASONS.ADDON_INSTALL || aReason == BOOTSTRAP_REASONS.ADDON_ENABLE) {
      loadImports();
      monkeyPatchAllWindows();
      Services.ww.openWindow(
        null,
        "chrome://conversations/content/assistant/assistant.xhtml",
        "",
        "chrome,width=800,height=500", {});
    }

    // In case of an up- or downgrade patch all windows again
    if (aReason == BOOTSTRAP_REASONS.ADDON_UPGRADE || aReason == BOOTSTRAP_REASONS.ADDON_DOWNGRADE) {
      loadImports();
      monkeyPatchAllWindows();
    }

    // Hook into options window
    Services.obs.addObserver({
      observe(aSubject, aTopic, aData) {
        if (aTopic == "addon-options-displayed" && aData == "gconversation@xulforum.org") {
          loadImports();
          CustomizeKeys.enable(aSubject); // aSubject is the options document
        }
      }
    }, "addon-options-displayed");
    Services.obs.addObserver({
      observe(aSubject, aTopic, aData) {
        if (aTopic == "addon-options-hidden" && aData == "gconversation@xulforum.org") {
          loadImports();
          CustomizeKeys.disable(aSubject); // aSubject is the options document
        }
      }
    }, "addon-options-hidden");
  } catch (e) {
    Log.error(e);
    dumpCallStack(e);
  }
}

function shutdown(aData, aReason) {
  let {SimpleStorage} = ChromeUtils.import("resource://conversations/modules/stdlib/SimpleStorage.js", {});
  SimpleStorage.close().catch(Cu.reportError);

  // No need to do extra work here
  Log.debug("shutdown, aReason=", aReason);
  if (aReason == BOOTSTRAP_REASONS.APP_SHUTDOWN)
    return;

  Services.ww.unregisterNotification(windowObserver);

  // Reasons to be here can be DISABLE or UNINSTALL
  ResourceRegister.uninit("conversations");
  for (let w of fixIterator(Services.wm.getEnumerator("mail:3pane")))
    w.Conversations.monkeyPatch.undo(aReason);
}

function install(aData, aReason) {
}

function uninstall(aData, aReason) {
}
