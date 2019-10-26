/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { Prefs } = ChromeUtils.import(
  "chrome://conversations/content/modules/prefs.js"
);
const { setupLogging, dumpCallStack } = ChromeUtils.import(
  "chrome://conversations/content/modules/log.js"
);
const { Customizations } = ChromeUtils.import(
  "chrome://conversations/content/modules/assistant.js"
);

let Log = setupLogging("Conversations.AssistantUI");
let uninstallInfos = JSON.parse(
  Prefs.getString("conversations.uninstall_infos")
);

function install(aKey) {
  if (!(aKey in Customizations)) {
    Log.error("Couldn't find a suitable customization for", aKey);
  } else {
    try {
      Log.debug("Installing customization", aKey);
      let uninstallInfo = Customizations[aKey].install();
      uninstallInfos[aKey] = uninstallInfo;
    } catch (e) {
      Log.error("Error in customization", aKey);
      Log.error(e);
      dumpCallStack(e);
    }
  }
}

let finishedAlready = false;
function finish() {
  // The user closed the window, so we ran finish() already, and now we're
  //  running it again because indexed just finished. Abort abort abort.
  if (finishedAlready) {
    return;
  }

  if (Prefs.getString("conversations.uninstall_infos") == "{}") {
    let str = JSON.stringify(uninstallInfos);
    Log.debug("Saving JSON uninstall information", str);
    Prefs.setString("conversations.uninstall_infos", str);
  } else {
    Log.warn("Uninstall information already there, not overwriting...");
  }
  finishedAlready = true;
  window.removeEventListener("unload", finish, true);
  window.close();
}

// This is the usual API: if you launch something asynchronous, just do
// expect () and call top () when you're done.
let expected = 1;
let ttop = function() {
  if (--expected == 0) {
    finish();
  }
};
Customizations.expect = () => expected++;
Customizations.ttop = ttop;

// --- UI event handlers
/* exported onFinish, onCustomSetup */

function onFinish() {
  // Register uninstall information if the user closes the window now.
  window.addEventListener("unload", finish, true);
  let workingItems = document.getElementsByClassName("working");
  for (let item of workingItems) {
    item.classList.remove("hidden");
  }
  let applyButton = document.getElementById("applyButton");
  applyButton.disabled = true;
  applyButton.textContent = workingItems[0].innerText;

  let checkboxes = document.querySelectorAll('input[type="checkbox"]');
  for (let checkbox of checkboxes) {
    if (checkbox.checked) {
      install(checkbox.id);
    } else {
      Log.debug("User declined", checkbox.id);
    }
  }
  ttop();
}

function onCustomSetup(event) {
  let more = document.getElementById("more");
  more.setAttribute("show", true);
  more.scrollIntoView({ alignToTop: false });
  event.target.classList.add("hidden");
}
