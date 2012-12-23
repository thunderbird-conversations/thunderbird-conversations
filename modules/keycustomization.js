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



function menulistChanged(event) {
  let menulist = event.target;
  menulist.parentNode.hotkeyBinding.func = menulist.selectedItem.label;
}
function buildMenuList(doc, parent, arr, selected) {
  let list = doc.createElementNS(XUL_NS, "menulist");
  parent.appendChild(list);
  list.setAttribute("sizetopopup", "always");
  list.addEventListener("select", menulistChanged, false);
  let popup = doc.createElementNS(XUL_NS, "menupopup");
  list.appendChild(popup);
  for (let [i, cmd] in Iterator(arr)) {
    let item = doc.createElementNS(XUL_NS, "menuitem");
    popup.appendChild(item);
    item.setAttribute("label", cmd);
    if (cmd == selected) {
      item.setAttribute("selected", "true");
    }
  }
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
}
function buildButton(doc, parent, label, state) {
  let btn = doc.createElementNS(XUL_NS, "button");
  parent.appendChild(btn);
  btn.setAttribute("type", "checkbox");
  btn.setAttribute("autoCheck", false);
  btn.setAttribute("label", label);
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
  let bindingGroups = undefined;
  if (isOSX) {
    bindingGroups = [ConversationKeybindings.OSX, ConversationKeybindings.Generic];
  } else { // TODO: Windows, Linux or other platform-specific bindings, rather than just "Other"?
    bindingGroups = [ConversationKeybindings.Other, ConversationKeybindings.Generic];
  }
  let btn = doc.createElementNS(XUL_NS, "button");
  btn.setAttribute("label", "Remove hotkey");
  parent.appendChild(btn);
  btn.addEventListener("command", function(event) {
    for (let [os, bindings] in Iterator(bindingGroups)) {
      if (key in bindings) {
        for (let [j, bind] in Iterator(bindings[key])) {
          if (bind === binding) {
            bindings[key].splice(j, 1);
          }
        }
      }
    }
    parent.parentNode.removeChild(parent);
  }, false);
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
  buildLbl(doc, hbox, key);
  hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
  buildLbl(doc, hbox, ":");
  hbox.appendChild(doc.createElementNS(XUL_NS, "separator"));
  buildMenuList(doc, hbox, ConversationKeybindings.availableActions, binding.func);
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
    let keysVbox = showhide.previousElementSibling;
    let bindingGroups = undefined;
    if (isOSX) {
      bindingGroups = [ConversationKeybindings.OSX, ConversationKeybindings.Generic];
    } else { // TODO: Windows, Linux or other platform-specific bindings, rather than just "Other"?
      bindingGroups = [ConversationKeybindings.Other, ConversationKeybindings.Generic];
    }
    for (let [os, bindings] in Iterator(bindingGroups)) {
      for (let [key, keybinding] in Iterator(bindings)) {
        for (let [j, binding] in Iterator(keybinding)) {
          keysVbox.appendChild(buildHotKey(doc, key, binding));
        }
      }
    }
  },
  disable : function disable(doc) {
    let showhide = doc.getElementById("showhidekeys");
    showhide.removeEventListener("command", showHide, false);
    let keysVbox = showhide.previousElementSibling;
    while (keysVbox.hasChildNodes())
      keysVbox.removeChild(keysVbox.firstChild);
  }
}
