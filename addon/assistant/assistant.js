/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

let finishedAlready = false;
async function finish() {
  // The user closed the window, so we ran finish() already, and now we're
  //  running it again because indexed just finished. Abort abort abort.
  if (finishedAlready) {
    return;
  }

  finishedAlready = true;
  window.removeEventListener("unload", finish, true);

  const tab = await browser.tabs.getCurrent();
  browser.tabs.remove(tab.id).catch(console.error);
}

// --- UI event handlers
/* exported onFinish, onCustomSetup */

async function onFinish() {
  // Register uninstall information if the user closes the window now.
  window.addEventListener("unload", finish, true);
  const workingItems = document.getElementsByClassName("working");
  for (const item of workingItems) {
    item.classList.remove("hidden");
  }
  for (const item of document.getElementsByClassName("settings")) {
    item.classList.add("hidden");
  }
  document.getElementById("intro").classList.add("hidden");
  document.getElementById("applyButton").classList.add("hidden");

  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  const itemsToInstall = [];
  for (let checkbox of checkboxes) {
    if (checkbox.checked) {
      itemsToInstall.push(checkbox.id);
    }
  }

  let port = browser.runtime.connect({ name: "assistant" });
  port.postMessage({
    itemsToInstall,
    tabId: (await browser.tabs.getCurrent()).id,
  });
}

window.addEventListener(
  "load",
  () => {
    // This section based on https://github.com/erosman/HTML-Internationalization
    // MPL2 License: https://discourse.mozilla.org/t/translating-options-pages/19604/23
    for (const node of document.querySelectorAll("[data-i18n]")) {
      let [text, attr] = node.dataset.i18n.split("|");
      text = browser.i18n.getMessage(text);
      attr
        ? (node[attr] = text)
        : node.appendChild(document.createTextNode(text));
    }
    document.getElementById("applyButton").onclick = onFinish;
  },
  { once: true }
);
