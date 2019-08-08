/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["CustomizeKeys"];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  ConversationKeybindings: "resource://conversations/modules/message.js",
  Services: "resource://gre/modules/Services.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});
const {entries, isOSX} = ChromeUtils.import("resource://conversations/modules/stdlib/misc.js");

let strings = new StringBundle("chrome://conversations/locale/keycustomization.properties");

// Binding groups will be an array containing
// ConversationKeybindings.bindings.<OSX or Other> and
// ConversationKeybindings.bindings.Generic Object.  Identity matters,
// and these objects may change as a result of calling
// loadKeybindings() or restoreKeybindings(), so this array is
// initialized lazily in CustomizeKeys.enable.
let bindingGroups = undefined;


const INACTIVE_KEY = Ci.nsIDOMXULButtonElement.CHECKSTATE_UNCHECKED; // 0
const ACTIVE_KEY = Ci.nsIDOMXULButtonElement.CHECKSTATE_CHECKED; // 1
const UNNEEDED_KEY = Ci.nsIDOMXULButtonElement.CHECKSTATE_MIXED; // 2
const KeyStyles = [
  // INACTIVE_KEY
  "color: #880000;" +
  "font-weight: bold;" +
  "text-decoration: line-through;" +
  "padding: 1px;" +
  "border-left:   1px solid #38678B;" +
  "border-top:    1px solid #38678B;" +
  "border-right:  1px solid #24435B;" +
  "border-bottom: 1px solid #24435B;",

  // ACTIVE_KEY
  "color: #008800;" +
  "font-weight: bold;" +
  "border-right:  2px solid #38678B;" +
  "border-bottom: 2px solid #38678B;" +
  "border-left:   2px solid #24435B;" +
  "border-top:    2px solid #24435B;",

  // UNNEEDED_KEY
  "border: 0px solid white;" +
  "padding: 2px;" +
  "color: gray;",
];


/**
 * Simple helper to turn "aTitleCasedString" into "A title cased string",
 * by splitting on capital letters, lowercasing them, and recombining with spaces.
 * Used to turn function names (e.g. "tagHandling") into more
 * human-friendly descriptions (e.g. "Tag handling")
 */
function titleCaseToSpacedWords(str) {
  let words = str.split(/(^.|[A-Z])/);
  let ret = "";
  words.shift();
  if (words.length % 2 == 1)
    words.unshift("");
  for (let i = 0; i < words.length; i += 2) {
    if (i > 0)
      ret += " " + words[i].toLowerCase() + words[i + 1];
    else
      ret += words[i].toUpperCase() + words[i + 1];
  }
  return ret;
}


/**
 * Produces a human-readable description of keys (particularly for
 * non-printing ones)
 */
function describeKey(key) {
  // Todo: handle other non-printable characters
  if (key === "\x0D")
    return strings.get("returnKey");
  if (key === "\x2E")
    return strings.get("deleteKey");
  if (key === " ")
    return strings.get("spaceKey");
  return key;
}


const PrefEditors = {
  /**
   * Updates a given binding's modifier key (Ctrl, Shift, Meta, Alt, or Super) with a new state
   * @param {Object} binding is the binding object itself
   * @param {String} modKey is the name of the modifier (lowercase)
   * @param {Number} state is the new state for the modifier key
   */
  updateBinding: function updateBinding(binding, modKey, state) {
    switch (state) {
    case INACTIVE_KEY:
      binding.mods[modKey + "Key"] = false; break;
    case ACTIVE_KEY:
      binding.mods[modKey + "Key"] = true; break;
    case UNNEEDED_KEY:
      delete binding.mods[modKey + "Key"]; break;
    default:
      Cu.reportError("Impossible checkState: " + state);
    }
  },

  /**
   * Actually deletes a hotkey from ConversationKeybindings.
   * @param {String} key is the letter of the hotkey to be removed
   * @param {Object} binding is the specific keybinding object to be removed
   */
  deleteBinding: function deleteBinding(key, binding) {
    for (let [/* os */, bindings] of entries(bindingGroups)) {
      if (key in bindings) {
        bindings[key] = bindings[key].filter(x => x !== binding);
        if (!bindings[key].length)
          delete bindings[key]; // For clarity, all empty arrays are removed
      }
    }
  },

  /**
   * Creates a keybinding
   * @param {String} key is the hotkey letter to be created
   * @param {String} func is the name of the hotkey callback function
   * @returns the binding object
   */
  createBinding: function createBinding(key, func) {
    let bindings = isOSX ? bindingGroups.OSX : bindingGroups.Other;
    if (!(key in bindings))
      bindings[key] = [];
    let binding = { mods: {}, func };
    bindings[key].push(binding);
    return binding;
  },
};


const Listeners = {
  /**
   * Event listener for modifier-key buttons.  After updating the button's
   * internal state, it updates the keybindings and saves the new settings.
   * The state for the button is stored in the "checkState" attribute:
   * https://developer.mozilla.org/en-US/docs/XUL/button#a-checkState
   */
  onModifierButtonClick: function onModifierButtonClick(event) {
    let btn = event.target;
    // cycles checkState 0 => 1 => 2 => 0 => ...
    // (N.B. technically, getAttribute returns a string, but it's always numeric)
    let newState = (parseInt(btn.getAttribute("checkState"), 10) + 1) % 3;
    btn.setAttribute("checkState", newState);
    btn.setAttribute("style", KeyStyles[newState]);
    let key = btn.getAttribute("label");
    let binding = btn.parentNode.hotkeyBinding;
    PrefEditors.updateBinding(binding, key, newState);
    ConversationKeybindings.saveKeybindings();
    event.stopPropagation();
  },


  /**
   * Event listener for changing the letter of a hotkey binding:
   * Essentially, it deletes the existing binding and constructs a new one,
   * then updates the state of the modifier-key buttons, and saves the new
   * keybinding state.
   */
  onLetterSelected: function onLetterSelected(event) {
    let parent = event.target.parentNode;
    if (parent.hotkey === event.target.value)
      return;
    let oldBinding = parent.hotkeyBinding;
    PrefEditors.deleteBinding(parent.hotkey, parent.hotkeyBinding);
    let binding = PrefEditors.createBinding(event.target.value, oldBinding.func);
    parent.hotkeyBinding = binding;
    parent.hotkey = event.target.value;
    for (let child of parent.querySelectorAll("button.setModifier")) {
      let state = parseInt(child.getAttribute("checkState"), 10);
      let modKey = child.getAttribute("label");
      PrefEditors.updateBinding(binding, modKey, state);
    }
    ConversationKeybindings.saveKeybindings();
  },

  /**
   * Event listener for modifying the function associated with a hotkey
   */
  onActionMenuSelect: function onActionMenuSelect(event) {
    let menulist = event.target;
    if (menulist.parentNode.hotkeyBinding.func === event.target.value)
      return;
    menulist.parentNode.hotkeyBinding.func = menulist.selectedItem.value;
    ConversationKeybindings.saveKeybindings();
    event.stopPropagation();
  },


  /**
   * Event listener to show or hide the hotkey customization UI
   */
  onShowHideClick: function onShowHideClick(event) {
    let showhide = event.target;
    let keysVbox = showhide.previousElementSibling;
    if (keysVbox.hidden) {
      if (CustomizeKeys.alreadyEditing) {
        Services.prompt.alert(null, strings.get("alreadyEditingTitle"), strings.get("alreadyEditingText"));
        return;
      }
      keysVbox.hidden = false;
      CustomizeKeys.alreadyEditing = true;
      showhide.label = strings.get("collapseKeys");
    } else {
      keysVbox.hidden = true;
      showhide.label = strings.get("expandKeys");
      CustomizeKeys.alreadyEditing = false;
    }
  },

  /**
   * Event listener for the Create-new-hotkey button
   */
  onCreateClick: function onCreateClick(event) {
    let hboxToInsertBefore = event.target.parentNode;
    let doc = event.target.ownerDocument;
    hboxToInsertBefore.parentNode.insertBefore(
      Templates.buildHotKey(doc, "A",
                            PrefEditors.createBinding("A", ConversationKeybindings.availableActions[0])),
      hboxToInsertBefore);
    event.stopPropagation();
  },

  /**
   * Event listener for the Restore-default-hotkeys button
   */
  onRestoreClick: function onRestoreClick(event) {
    let doc = event.target.ownerDocument;
    CustomizeKeys.disable(doc);
    ConversationKeybindings.restoreKeybindings();
    ConversationKeybindings.saveKeybindings();
    CustomizeKeys.enable(doc);
    event.stopPropagation();
  },

  /**
   * Event listener for deleting an individual hotkey
   */
  onDeleteClick: function onDeleteClick(event) {
    let parent = event.target.parentNode;
    // NOTE: We cannot use the variables key or binding from Templates.buildDelete,
    // because keys (and bindings) are editable and may change. Instead, we must
    // use the hotkey and hotkeyBinding properties stashed on the parent hbox object.
    PrefEditors.deleteBinding(parent.hotkey, parent.hotkeyBinding);
    delete parent.hotkey;
    delete parent.hotkeyBinding;
    parent.remove();
    ConversationKeybindings.saveKeybindings();
    event.stopPropagation();
  },
};

const Templates = {
  /**
   * Constructs a drop-down menu of the available actions that a
   * hotkey can trigger.
   * @param {XULDocument} doc is the settings document
   * @param {HBox} parent is the specific container element for this menu
   * @param {Array of strings} arr is array of function names of available actions
   * @param {String} selected is initial function name to be selected
   * @return The menu list
   */
  buildActionMenuList: function buildActionMenuList(doc, parent, arr, selected) {
    let list = doc.createXULElement("menulist");
    parent.appendChild(list);
    list.setAttribute("sizetopopup", "always");
    list.setAttribute("class", "actionList");
    let popup = doc.createXULElement("menupopup");
    list.appendChild(popup);
    for (let cmd of arr) {
      let item = doc.createXULElement("menuitem");
      popup.appendChild(item);
      item.setAttribute("value", cmd);
      item.setAttribute("label", titleCaseToSpacedWords(cmd));
      if (cmd == selected)
        item.setAttribute("selected", "true");
    }
    list.addEventListener("select", Listeners.onActionMenuSelect);
    return list;
  },

  /**
   * Simple helper function to construct a text label
   * @param {XULDocument} doc is the settings document
   * @param {HBox} parent is the specific container element for this menu
   * @param {String} text to be displayed
   * @return The label
   */
  buildLbl: function buildLbl(doc, parent, text) {
    let lbl = doc.createXULElement("label");
    parent.appendChild(lbl);
    lbl.setAttribute("value", text);
    return lbl;
  },

  /**
   * Constructs a modifier-key button
   * @param {XULDocument} doc is the settings document
   * @param {HBox} parent is the specific container element for this menu
   * @param {String} label is the name of the modifier key
   * @param {Boolean|Undef} state the initial value of the modifier key for
   *        the current hotkey
   * @returns the button
   */
  buildButton: function buildButton(doc, parent, label, state) {
    let btn = doc.createXULElement("button");
    parent.appendChild(btn);
    btn.setAttribute("type", "checkbox");
    btn.setAttribute("autoCheck", false);
    btn.setAttribute("label", label);
    btn.setAttribute("class", "setModifier");
    if (state == undefined)
      state = UNNEEDED_KEY;
    else if (state)
      state = ACTIVE_KEY;
    else
      state = INACTIVE_KEY;
    btn.setAttribute("checkState", state);
    btn.setAttribute("style", KeyStyles[state]);
    btn.addEventListener("command", Listeners.onModifierButtonClick);
    return btn;
  },


  /**
   * Constructs a button to delete a hotkey binding
   * @param {XULDocument} doc is the settings document
   * @param {HBox} parent is the specific container element for this menu
   * @param {String} key is the main letter of the hotkey
   * @returns the button
   */
  buildDelete: function buildDelete(doc, parent, key) {
    let btn = doc.createXULElement("button");
    btn.setAttribute("label", strings.get("removeHotkey"));
    parent.appendChild(btn);
    btn.addEventListener("command", Listeners.onDeleteClick);
  },


  /**
   * Constructs the drop-down selector for the letter of a hotkey
   * @param {XULDocument} doc is the settings document
   * @param {HBox} parent is the specific container element for this menu
   * @param {String} key is the letter to be used in the hotkey
   * @returns the drop-down lost
   */
  buildLetterSelect: function buildLetterSelect(doc, parent, key) {
    let list = doc.createXULElement("menulist");
    parent.appendChild(list);
    list.setAttribute("sizetopopup", "always");
    let popup = doc.createXULElement("menupopup");
    list.appendChild(popup);
    // Helper function for use in creating drop-down list menuitems
    // for each letter, digit and symbol that we support
    // Todo: list these elsewhere more explicitly.
    let createItem = function(itemKey) {
      let item = doc.createXULElement("menuitem");
      popup.appendChild(item);
      item.setAttribute("value", itemKey);
      item.setAttribute("label", describeKey(itemKey));
      if (itemKey === key)
        item.setAttribute("selected", "true");
    };
    for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++)
      createItem(String.fromCharCode(i));
    for (let i = "0".charCodeAt(0); i <= "9".charCodeAt(0); i++)
      createItem(String.fromCharCode(i));
    createItem("\x0D");
    createItem("\x2E");
    list.addEventListener("select", Listeners.onLetterSelected);
  },


  /**
   * Constructs the widget for manipulating a given hotkey binding
   * @param {XULDocument} doc is the settings document
   * @param {String} key is the hotkey letter
   * @param {Object} binding is the hotkey binding description object
   * @returns the hbox widget
   */
  buildHotKey: function buildHotKey(doc, key, binding) {
    let hbox = doc.createXULElement("hbox");
    hbox.hotkey = key;
    hbox.hotkeyBinding = binding;
    Templates.buildDelete(doc, hbox, key);
    for (let k of ["super", "ctrl", "shift", "meta", "alt"]) {
      Templates.buildButton(doc, hbox, k, binding.mods[k + "Key"]);
      hbox.appendChild(doc.createXULElement("separator"));
      Templates.buildLbl(doc, hbox, "+");
      hbox.appendChild(doc.createXULElement("separator"));
    }
    Templates.buildLetterSelect(doc, hbox, key);
    hbox.appendChild(doc.createXULElement("separator"));
    Templates.buildLbl(doc, hbox, ":");
    hbox.appendChild(doc.createXULElement("separator"));
    Templates.buildActionMenuList(doc, hbox, ConversationKeybindings.availableActions, binding.func);
    return hbox;
  },

  /**
   * Constructs the restore-default-hotkeys button
   * @param {XULDocument} doc is the settings document
   * @return the hbox containing the button
   */
  buildRestore: function buildRestore(doc) {
    let hbox = doc.createXULElement("hbox");
    let btn = doc.createXULElement("button");
    hbox.appendChild(btn);
    btn.setAttribute("label", strings.get("restoreKeys"));
    btn.addEventListener("command", Listeners.onRestoreClick);
    return hbox;
  },

  /**
   * Constructs the create-new-hotkey button
   * @param {XULDocument} doc is the settings document
   * @return the hbox containing the button
   */
  buildCreate: function buildCreate(doc) {
    let hbox = doc.createXULElement("hbox");
    let btn = doc.createXULElement("button");
    hbox.appendChild(btn);
    btn.setAttribute("label", strings.get("createHotkey"));
    btn.addEventListener("command", Listeners.onCreateClick);
    return hbox;
  },
};


const CustomizeKeys = {
  enable: function enable(doc) {
    let showhide = doc.getElementById("showhidekeys");
    showhide.addEventListener("command", Listeners.onShowHideClick);
    // Must be here, rather than at top level, because load/restoreKeybindings will
    // destroy the previous values
    if (isOSX) {
      bindingGroups = {OSX:     ConversationKeybindings.bindings.OSX,
                       Generic: ConversationKeybindings.bindings.Generic};
    } else { // TODO: Windows, Linux or other platform-specific bindings, rather than just "Other"?
      bindingGroups = {Other:   ConversationKeybindings.bindings.Other,
                       Generic: ConversationKeybindings.bindings.Generic};
    }
    let keysVbox = showhide.previousElementSibling;
    for (let [/* os */, bindings] of entries(bindingGroups)) {
      for (let [key, keybinding] of entries(bindings)) {
        for (let binding of keybinding) {
          keysVbox.appendChild(Templates.buildHotKey(doc, "" + key, binding));
        }
      }
    }
    keysVbox.appendChild(Templates.buildCreate(doc));
    keysVbox.appendChild(Templates.buildRestore(doc));
  },
  disable: function disable(doc) {
    let showhide = doc.getElementById("showhidekeys");
    showhide.removeEventListener("command", Listeners.onShowHideClick);
    let keysVbox = showhide.previousElementSibling;
    while (keysVbox.hasChildNodes())
      keysVbox.firstChild.remove();
  },
};
