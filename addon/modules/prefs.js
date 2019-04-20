var EXPORTED_SYMBOLS = ["Prefs", "kStubUrl"];

const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm", null);

const gConversationsPrefs = Services.prefs.getBranch("conversations.");

const kStubUrl = "chrome://conversations/content/stub.xhtml";

// That's why I'm lovin' restartless.
function loadDefaultPrefs() {
  let prefs = Services.prefs.QueryInterface(Ci.nsIPrefBranch);
  // All code below hamelessly stolen from the SDK
  let branch = prefs.getDefaultBranch("");
  let prefLoaderScope = {
    pref(key, val) {
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
    },
  };

  let uri = Services.io.newURI(
      "defaults/preferences/defaults.js",
      null,
      Services.io.newURI("resource://conversations/"));

  // setup default prefs
  try {
    Services.scriptloader.loadSubScript(uri.spec, prefLoaderScope);
  } catch (e) {
    dump("Error loading default preferences at " + uri.spec + ": " + e + "\n");
  }
}

function PrefManager() {
  console.log("PrefManager init");
  loadDefaultPrefs();

  this.expand_who = gConversationsPrefs.getIntPref("expand_who");
  this.no_friendly_date = gConversationsPrefs.getBoolPref("no_friendly_date");
  this.logging_enabled = gConversationsPrefs.getBoolPref("logging_enabled");
  this.tweak_bodies = gConversationsPrefs.getBoolPref("tweak_bodies");
  this.tweak_chrome = gConversationsPrefs.getBoolPref("tweak_chrome");
  this.add_embeds = gConversationsPrefs.getBoolPref("add_embeds");
  this.operate_on_conversations = gConversationsPrefs.getBoolPref("operate_on_conversations");
  this.enabled = gConversationsPrefs.getBoolPref("enabled");
  this.extra_attachments = gConversationsPrefs.getBoolPref("extra_attachments");
  this.hide_quote_length = gConversationsPrefs.getIntPref("hide_quote_length");
  this.hide_sigs = gConversationsPrefs.getBoolPref("hide_sigs");
  this.compose_in_tab = gConversationsPrefs.getBoolPref("compose_in_tab");
  // This is a hashmap
  this.monospaced_senders = {};
  for (let s of this.split(gConversationsPrefs.getCharPref("monospaced_senders")))
    this.monospaced_senders[s] = null;

  this.watchers = [];

  this.register();
}

PrefManager.prototype = {

  split: s => s.split(",").map(s => s.trim()).map(s => s.toLowerCase()),

  watch(watcher) { return this.watchers.push(watcher); },

  register: function mpo_register(observer) {
    gConversationsPrefs.QueryInterface(Ci.nsIPrefBranch);
    if (observer)
      gConversationsPrefs.addObserver("", observer);
    else
      gConversationsPrefs.addObserver("", this);
  },

  unregister: function mpo_unregister() {
    if (!gConversationsPrefs)
      return;
    gConversationsPrefs.removeObserver("", this);
  },

  observe: function mpo_observe(aSubject, aTopic, aData) {
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
        let v = gConversationsPrefs.getBoolPref(aData);
        this[aData] = v;
        this.watchers.map(w => w(aData, v));
        break;
      }

      case "expand_who":
      case "hide_quote_length": {
        let v = gConversationsPrefs.getIntPref(aData);
        this[aData] = v;
        this.watchers.map(w => w(aData, v));
        break;
      }

      case "monospaced_senders":
        this.monospaced_senders = {};
        for (let s of this.split(gConversationsPrefs.getCharPref("monospaced_senders")))
          this.monospaced_senders[s] = null;
        break;
    }
  },

  hasPref(p) {
    return (Services.prefs.getPrefType(p) != Ci.nsIPrefBranch.PREF_INVALID);
  },

  getChar(p) {
    return Services.prefs.getCharPref(p);
  },

  getInt(p) {
    return Services.prefs.getIntPref(p);
  },

  getBool(p) {
    return Services.prefs.getBoolPref(p);
  },

  getString(p) {
    return Services.prefs.getStringPref(p);
  },

  setChar(p, v) {
    return Services.prefs.setCharPref(p, v);
  },

  setInt(p, v) {
    return Services.prefs.setIntPref(p, v);
  },

  setBool(p, v) {
    return Services.prefs.setBoolPref(p, v);
  },

  setString(p, v) {
    return Services.prefs.setStringPref(p, v);
  },

  get kStubUrl() {
    return kStubUrl;
  },

  kScrollUnreadOrLast: 0,
  kScrollSelected: 1,

  kExpandNone: 1,
  kExpandAll: 3,
  kExpandAuto: 4,
};

// Prefs is a singleton.
var Prefs = new PrefManager();
