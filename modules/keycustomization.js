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

var EXPORTED_SYMBOLS = ['CustomizeKeys']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

let isOSX = ("nsILocalFileMac" in Ci);
let isWindows = ("@mozilla.org/windows-registry-key;1" in Cc);
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

Cu.import("resource://conversations/modules/message.js");
Cu.import("resource://conversations/modules/log.js");
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
let strings = new StringBundle("chrome://conversations/locale/keycustomization.properties");
let Log = setupLogging("Conversations.Message");

let bindingGroups = undefined;


const InactiveKey =
  "color: #880000;" +
  "font-weight: bold;" +
  "text-decoration: line-through;" +
  "padding: 1px;" +
  "border-left:   1px solid #38678B;" +
  "border-top:    1px solid #38678B;" +
  "border-right:  1px solid #24435B;" +
  "border-bottom: 1px solid #24435B;";

const ActiveKey =
  "color: #008800;" +
  "font-weight: bold;" +
  "border-right:  2px solid #38678B;" +
  "border-bottom: 2px solid #38678B;" +
  "border-left:   2px solid #24435B;" +
  "border-top:    2px solid #24435B;";

const UnneededKey = 
  "border: 0px solid white;" +
  "padding: 2px;" +
  "color: gray;";


function titleCaseToSpacedWords(str) {
  let words = str.split(/(^.|[A-Z])/);
  let ret = "";
  words.shift();
  if (words.length % 2 == 1)
    words.unshift("");
  for (let i = 0; i < words.length; i += 2) {
    if (i > 0)
      ret += " " + words[i].toLowerCase() + words[i+1];
    else
      ret += words[i].toUpperCase() + words[i+1];
  }
  return ret;
}


function menulistChanged(event) {
  let menulist = event.target;
  menulist.parentNode.hotkeyBinding.func = menulist.selectedItem.value;
  ConversationKeybindings.saveKeybindings();
  event.stopPropagation();
}
function buildMenuList(doc, parent, arr, selected) {
  let list = doc.createElementNS(XUL_NS, "menulist");
  parent.appendChild(list);
  list.setAttribute("sizetopopup", "always");
  list.setAttribute("class", "actionList");
  let popup = doc.createElementNS(XUL_NS, "menupopup");
  list.appendChild(popup);
  for (let [i, cmd] in Iterator(arr)) {
    let item = doc.createElementNS(XUL_NS, "menuitem");
    popup.appendChild(item);
    item.setAttribute("value", cmd);
    item.setAttribute("label", titleCaseToSpacedWords(cmd));
    if (cmd == selected)
      item.setAttribute("selected", "true");
  }
  list.addEventListener("select", menulistChanged, false);
  return list;
}
function buildLbl(doc, parent, text) {
  let lbl = doc.createElementNS(XUL_NS, "label");
  parent.appendChild(lbl);
  lbl.setAttribute("value", text);
  return lbl;
}
function setStyle(btn) {
  let state = btn.getAttribute("checkState");
  if (state == 0)
    btn.setAttribute("style", InactiveKey);
  else if (state == 1)
    btn.setAttribute("style", ActiveKey);
  else
    btn.setAttribute("style", UnneededKey);
}
function buttonOnCheck(event) {
  try {
  let btn = event.target;
  let newState = (btn.getAttribute("checkState") + 1) % 3;
  btn.setAttribute("checkState", newState);
  setStyle(btn);
  let key = btn.getAttribute("label");
  let binding = btn.parentNode.hotkeyBinding;
  if (newState == 0)
    binding.mods[key + "Key"] = false;
  else if (newState == 1)
    binding.mods[key + "Key"] = true;
  else if (key + "Key" in binding.mods)
    delete binding.mods[key + "Key"];
  ConversationKeybindings.saveKeybindings();
  event.stopPropagation();
    } catch (e) { Cu.reportError(e); }
}
function buildButton(doc, parent, label, state) {
  let btn = doc.createElementNS(XUL_NS, "button");
  parent.appendChild(btn);
  btn.setAttribute("type", "checkbox");
  btn.setAttribute("autoCheck", false);
  btn.setAttribute("label", label);
  btn.setAttribute("class", "setModifier");
  if (state == undefined)
    btn.setAttribute("checkState", 2);
  else if (state)
    btn.setAttribute("checkState", 1);
  else
    btn.setAttribute("checkState", 0);
  setStyle(btn);
  btn.addEventListener("command", buttonOnCheck, false);
  return btn;
}

function buildDelete(doc, parent, key, binding) {
  let btn = doc.createElementNS(XUL_NS, "button");
  btn.setAttribute("label", strings.get("removeHotkey"));
  parent.appendChild(btn);
  btn.addEventListener("command", function(event) {
    // NOTE: Cannot be key or binding, because keys (and bindings) can now change!
    deleteBinding(parent.hotkey, parent.hotkeyBinding); 
    delete parent.hotkey;
    delete parent.hotkeyBinding;
    parent.parentNode.removeChild(parent);
    ConversationKeybindings.saveKeybindings();
    event.stopPropagation();
  }, false);
}

function deleteBinding(key, binding) {
  for (let [os, bindings] in Iterator(bindingGroups)) {
    if (key in bindings) {
      for (let [j, bind] in Iterator(bindings[key])) {
        Cu.reportError("Trying " + os + "." + key + "." + j + "...");
        if (bind === binding) {
          Cu.reportError("Deleting binding " + JSON.stringify(binding, null, 2) 
                         + " from ConversationKeybindings.bindings." + os + "." + key);
          bindings[key].splice(j, 1);
          if (bindings[key].length == 0)
            delete bindings[key];
          return;
        }
      }
    }
  }
  Cu.reportError("Did not find " + key + "=>" + JSON.stringify(binding));
}
function createBinding(key, func) {
  let bindings = isOSX ? bindingGroups.OSX : bindingGroups.Other;
  if (!(key in bindings))
    bindings[key] = [];
  let binding = { mods: {}, func: func };
  bindings[key].push(binding);
  return binding;
}

function letterSelection(event) {
  try {
    let parent = event.target.parentNode;
    if (parent.hotkey === event.target.value)
      return;
    Cu.reportError("Changing key from " + parent.hotkey + " to " + event.target.value);
    let oldBinding = parent.hotkeyBinding;
    deleteBinding(parent.hotkey, parent.hotkeyBinding);
    let binding = createBinding(event.target.value, oldBinding.func);
    parent.hotkeyBinding = binding;
    parent.hotkey = event.target.value;
    for (let [i,child] in Iterator(parent.querySelectorAll("button.setModifier"))) {
      let state = child.getAttribute("checkState");
      let modKey = child.getAttribute("label");
      if (state == 0)
        binding.mods[modKey + "Key"] = false;
      else if (state == 1)
        binding.mods[modKey + "Key"] = true;
      else if (modKey + "Key" in binding.mods)
        delete binding.mods[modKey + "Key"];
    }
    ConversationKeybindings.saveKeybindings();
  } catch (e) { Cu.reportError("In letterSelection: " + e); }
}
function buildLetterSelect(doc, parent, key) {
  let keyCode = key.charCodeAt(0);
  let list = doc.createElementNS(XUL_NS, "menulist");
  parent.appendChild(list);
  list.setAttribute("sizetopopup", "always");
  let popup = doc.createElementNS(XUL_NS, "menupopup");
  list.appendChild(popup);
  function createItem(itemKey) {
    let item = doc.createElementNS(XUL_NS, "menuitem");
    popup.appendChild(item);
    item.setAttribute("value", itemKey);
    item.setAttribute("label", describeKey(itemKey));
    if (itemKey === key)
      item.setAttribute("selected", "true");
  }
  for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++)
    createItem(String.fromCharCode(i));
  for (let i = "0".charCodeAt(0); i <= "9".charCodeAt(0); i++)
    createItem(String.fromCharCode(i));
  createItem("\x0D");
  createItem("\x2E");
  list.addEventListener("select", letterSelection, false);
}
// Todo: handle other non-printable characters
function describeKey(key) {
  if (key === "\x0D")
    return strings.get("returnKey");
  if (key === "\x2E")
    return strings.get("deleteKey");
  if (key === " ")
    return strings.get("spaceKey");
  return key;
}
function buildHotKey(doc, key, binding) {
  let hbox = doc.createElementNS(XUL_NS, "hbox");
  hbox.hotkey = key;
  hbox.hotkeyBinding = binding;
  buildDelete(doc, hbox, key, binding);
  for (let [i, k] in Iterator(["super", "ctrl", "shift", "meta", "alt"])) {
    buildButton(doc, hbox, k, binding.mods[k + "Key"]);
    hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
    buildLbl(doc, hbox, "+");
    hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
  }
  buildLetterSelect(doc, hbox, key);
  hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
  buildLbl(doc, hbox, ":");
  hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
  buildMenuList(doc, hbox, ConversationKeybindings.availableActions, binding.func);
  return hbox;
}

function buildRestore(doc) {
  let hbox = doc.createElementNS(XUL_NS, "hbox");
  let btn = doc.createElementNS(XUL_NS, "button");
  hbox.appendChild(btn);
  btn.setAttribute("label", strings.get("restoreKeys"));
  btn.addEventListener("command", function(event) {
    CustomizeKeys.disable(doc);
    ConversationKeybindings.restoreKeybindings();
    ConversationKeybindings.saveKeybindings();
    CustomizeKeys.enable(doc);
    event.stopPropagation();
  }, false);
  return hbox;
}

function buildCreate(doc) {
  let hbox = doc.createElementNS(XUL_NS, "hbox");
  let btn = doc.createElementNS(XUL_NS, "button");
  hbox.appendChild(btn);
  btn.setAttribute("label", strings.get("createHotkey"));
  btn.addEventListener("command", function(event) {
    btn.parentNode.insertBefore(
      buildHotKey(doc, "A", createBinding("A", ConversationKeybindings.availableActions[0])), 
      btn);
    event.stopPropagation();
  }, false);
  return hbox;
}

function showHide(event) {
  let showhide = event.target;
  let keysVbox = showhide.previousElementSibling;
  if (keysVbox.hidden) {
    keysVbox.hidden = false;
    showhide.label = strings.get("collapseKeys");
  } else {
    keysVbox.hidden = true;
    showhide.label = strings.get("expandKeys");
  }
}


const CustomizeKeys = {
  enable : function enable(doc) {
    let showhide = doc.getElementById("showhidekeys");
    showhide.addEventListener("command", showHide, false);
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
    try {
      Cu.reportError(JSON.stringify(bindingGroups, null, 2));
    for (let [os, bindings] in Iterator(bindingGroups)) {
      for (let [key, keybinding] in Iterator(bindings)) {
        for (let [j, binding] in Iterator(keybinding)) {
          keysVbox.appendChild(buildHotKey(doc, ""+key, binding));
        }
      }
    }
    } catch (e) { Cu.reportError(e); }
    keysVbox.appendChild(buildCreate(doc));
    keysVbox.appendChild(buildRestore(doc));
  },
  disable : function disable(doc) {
    let showhide = doc.getElementById("showhidekeys");
    showhide.removeEventListener("command", showHide, false);
    let keysVbox = showhide.previousElementSibling;
    while (keysVbox.hasChildNodes())
      keysVbox.removeChild(keysVbox.firstChild);
    Cu.reportError("disable is called!");
  }
}
