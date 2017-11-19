var EXPORTED_SYMBOLS = ["Prefs", "kStubUrl"]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/Services.jsm");

const prefsService = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService)
  .getBranch("conversations.");
const gPrefBranch = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService)
  .getBranch(null);

const kStubUrl = "chrome://conversations/content/stub.xhtml";

// That's why I'm lovin' restartless.
function loadDefaultPrefs () {
  let prefs = Services.prefs.QueryInterface(Ci.nsIPrefBranch);
  // All code below hamelessly stolen from the SDK
  let branch = prefs.getDefaultBranch("");
  let prefLoaderScope = {
    pref: function(key, val) {
      switch (typeof val) {
        case "boolean":
          branch.setBoolPref(key, val);
          break;
        case "number":
          branch.setIntPref(key, val);
          break;
        case "string":
          branch.setCharPref(key, val);
          break;
      }
    }
  };

  let uri = Services.io.newURI(
      "defaults/preferences/defaults.js",
      null,
      Services.io.newURI("resource://conversations/", null, null));

  // setup default prefs
  try {
    Services.scriptloader.loadSubScript(uri.spec, prefLoaderScope);
  } catch (e) {
    dump("Error loading default preferences at "+uri.spec+": "+e+"\n");
  }
}

function PrefManager() {
  loadDefaultPrefs();

  this.expand_who = prefsService.getIntPref("expand_who");
  this.no_friendly_date = prefsService.getBoolPref("no_friendly_date");
  this.logging_enabled = prefsService.getBoolPref("logging_enabled");
  this.tweak_bodies = prefsService.getBoolPref("tweak_bodies");
  this.tweak_chrome = prefsService.getBoolPref("tweak_chrome");
  this.add_embeds = prefsService.getBoolPref("add_embeds");
  this.operate_on_conversations = prefsService.getBoolPref("operate_on_conversations");
  this.enabled = prefsService.getBoolPref("enabled");
  this.extra_attachments = prefsService.getBoolPref("extra_attachments");
  this.hide_quote_length = prefsService.getIntPref("hide_quote_length");
  this.hide_sigs = prefsService.getBoolPref("hide_sigs");
  this.compose_in_tab = prefsService.getBoolPref("compose_in_tab");
  // This is a hashmap
  this.monospaced_senders = {};
  for (let s of this.split(prefsService.getCharPref("monospaced_senders")))
    this.monospaced_senders[s] = null;

  this.watchers = [];

  this.register();
}

PrefManager.prototype = {

  split: s => s.split(",").map(s => s.trim()).map(s => s.toLowerCase()),

  watch: function (watcher) { return this.watchers.push(watcher); },

  register: function mpo_register (observer) {
    prefsService.QueryInterface(Ci.nsIPrefBranch);
    if (observer)
      prefsService.addObserver("", observer, false);
    else
      prefsService.addObserver("", this, false);
  },

  unregister: function mpo_unregister () {
    if (!prefsService)
      return;
    prefsService.removeObserver("", this);
  },

  observe: function mpo_observe (aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed")
      return;

    switch (aData) {
      case "no_friendly_date":
      case "logging_enabled":
      case "tweak_bodies":
      case "tweak_chrome":
      case "add_embeds":
      case "operate_on_conversations":
      case "extra_attachments":
      case "compose_in_tab":
      case "enabled":
      case "hide_sigs": {
        let v = prefsService.getBoolPref(aData)
        this[aData] = v;
        this.watchers.map(w => w(aData, v));
        break;
      }

      case "expand_who":
      case "hide_quote_length": {
        let v = prefsService.getIntPref(aData)
        this[aData] = v;
        this.watchers.map(w => w(aData, v));
        break;
      }

      case "monospaced_senders":
        this.monospaced_senders = {};
        for (let s of this.split(prefsService.getCharPref("monospaced_senders")))
          this.monospaced_senders[s] = null;
        break;
    }
  },

  hasPref: function (p) {
    return (gPrefBranch.getPrefType(p) != Ci.nsIPrefBranch.PREF_INVALID);
  },

  getChar: function (p) {
    return gPrefBranch.getCharPref(p);
  },

  getInt: function (p) {
    return gPrefBranch.getIntPref(p);
  },

  getBool: function (p) {
    return gPrefBranch.getBoolPref(p);
  },

  getString: function (p) {
    return gPrefBranch.getComplexValue(p, Ci.nsISupportsString).data;
  },

  setChar: function (p, v) {
    return gPrefBranch.setCharPref(p, v);
  },

  setInt: function (p, v) {
    return gPrefBranch.setIntPref(p, v);
  },

  setBool: function (p, v) {
    return gPrefBranch.setBoolPref(p, v);
  },

  setString: function (p, v) {
    let str = Cc["@mozilla.org/supports-string;1"]
              .createInstance(Ci.nsISupportsString);
    str.data = v;
    return gPrefBranch.setComplexValue(p, Ci.nsISupportsString, str);
  },

  kScrollUnreadOrLast: 0,
  kScrollSelected: 1,

  kExpandNone: 1,
  kExpandAll: 3,
  kExpandAuto: 4,
}

// Prefs is a singleton.
let Prefs = new PrefManager();
