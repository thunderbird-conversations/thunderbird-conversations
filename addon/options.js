// TODO: Some of this preference code should be in the background script prefs.js,
// however we currently aren't able to use sendMessage to send to both the
// background script and to bootstrap.js.

/* eslint-env webextensions */

let currentPreferences;

function getPref(name, prefs) {
  if (prefs.preferences && name in prefs.preferences) {
    return prefs.preferences[name];
  }
  throw new Error(`No default for ${name}`);
}

function prefsSaveNeeded(prefs) {
  for (let element of document.forms.conversationOptions.elements) {
    let hasChanged = false;
    if (element && element.name) {
      if (element.type == "number") {
        hasChanged = prefs.preferences[element.name] != parseInt(element.value, 10);
      } else if (element.type == "radio") {
        if (element.checked) {
          hasChanged = prefs.preferences[element.name] != element.value;
        }
      } else if (element.type == "checkbox") {
        hasChanged = prefs.preferences[element.name] != element.checked;
      } else {
        hasChanged = prefs.preferences[element.name] != element.value;
      }
    }
    if (hasChanged) {
      return true;
    }
  }
  return false;
}

async function saveOptions() {
  if (!prefsSaveNeeded(currentPreferences)) {
    return;
  }

  // Construct the object.
  for (let element of document.forms.conversationOptions.elements) {
    if (element && element.name) {
      if (element.type == "number") {
        currentPreferences.preferences[element.name] = parseInt(element.value, 10);
      } else if (element.type == "radio") {
        if (element.checked) {
          currentPreferences.preferences[element.name] = element.value;
        }
      } else if (element.type == "checkbox") {
        currentPreferences.preferences[element.name] = element.checked;
      } else {
        currentPreferences.preferences[element.name] = element.value;
      }
    }
  }

  await browser.storage.local.set(currentPreferences);
}

function insertL10n(tagName) {
  let elements = document.getElementsByTagName(tagName);
  for (let i = 0; i < elements.length; i++) {
    let element = elements[i];
    let message = element.getAttribute("data-l10n-id");
    if (message) {
      element.textContent = browser.i18n.getMessage(message);
    }
  }
}

function initOptions() {
  insertL10n("label");
  insertL10n("h1");
  document.title = browser.i18n.getMessage("extensionName");

  restoreOptions().catch(console.error);
}

function restorePref(element, prefs) {
  let value = getPref(element.name, prefs);
  if (element.type === "radio") {
    element.checked = parseInt(element.value, 10) == value;
  } else if (element.type === "checkbox") {
    element.checked = value;
  } else {
    element.value = value;
  }
}

async function restoreOptions() {
  currentPreferences = await browser.storage.local.get(`preferences`);

  let elements = document.getElementsByClassName("pref");
  for (let i = 0; i < elements.length; i++) {
    let element = elements[i];
    restorePref(element, currentPreferences);
  }
}

document.addEventListener("DOMContentLoaded", initOptions);
document.querySelector("form").addEventListener("change", saveOptions);

window.addEventListener("beforeunload", event => {
  document.removeEventListener("DOMContentLoaded", initOptions);
  document.querySelector("form").removeEventListener("change", saveOptions);
  saveOptions();
}, {once: true});
