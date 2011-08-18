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

"use strict";

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");

let global = this;

// from wjohnston (cleary for Fennec)
let ResourceRegister = {
  init: function(aFile, aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    let alias = Services.io.newFileURI(aFile);
    if (!aFile.isDirectory()) {
      alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
    }
    resource.setSubstitution(aName, alias);
  },

  uninit: function(aName) {
    let resource = Services.io.getProtocolHandler("resource")
      .QueryInterface(Ci.nsIResProtocolHandler);
    resource.setSubstitution(aName, null);
  }
}

function monkeyPatchWindow(window) {
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
  };

  // We instantiate the Monkey-Patch for the given Conversation object.
  let monkeyPatch = new MonkeyPatch(window, Conversation);
  // And then we seize the window and insert our code into it
  monkeyPatch.apply();

  // Used by the in-stub.html detachTab function
  Conversations.monkeyPatch = monkeyPatch;
}

function startup(aData, aReason) {
  ResourceRegister.init(aData.installPath, "conversations");

  Cu.import("resource://conversations/modules/monkeypatch.js", global);
  Cu.import("resource://conversations/modules/conversation.js", global);
  Cu.import("resource://conversations/modules/config.js", global);
  Cu.import("resource://conversations/modules/prefs.js", global);
  Cu.import("resource://conversations/modules/log.js", global);

  let Log = setupLogging("Conversations.MonkeyPatch");

  try {
    // Import all required plugins. If you create a new plugin, install it here.
    Cu.import("resource://conversations/plugins/glodaAttrProviders.js");
    Cu.import("resource://conversations/plugins/embeds.js");
    Cu.import("resource://conversations/plugins/enigmail.js");
    Cu.import("resource://conversations/plugins/lightning.js");

    // Patch all existing windows
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane")))
      monkeyPatchWindow(w);

    // Patch all future windows
    Services.ww.registerNotification({
      observer: function (aSubject, aTopic, aData) {
        if (aTopic == "domwindowopened") {
          aSubject.QueryInterface(Ci.nsIDOMWindow);
          monkeyPatchWindow(aSubject.window);
        }
      },
    });

    // Assistant.
    if (Prefs.getInt("conversations.version") < conversationsCurrentVersion)
      Services.ww.openWindow(
        null,
        "chrome://conversations/content/assistant/assistant.xhtml",
        "",
        "chrome,width=800,height=500");

    // Feedback.
    let nRuns = Prefs.getInt("conversations.nruns");
    if (nRuns == 20)
      Services.ww.openWindow(
        null,
        "chrome://conversations/content/feedback.xhtml",
        "",
        "chrome,width=320,height=550");

    Prefs.setInt("conversations.nruns", nRuns + 1);
  } catch (e) {
    dump(e+"\n");
    dump(e.stack+"\n");
    Log.error(e);
    dumpCallStack(e);
  }
}

function shutdown(data, reason) {
  ResourceRegister.uninit("conversations");
}

function install(data, reason) {
}

function uninstall(data, reason) {
}
