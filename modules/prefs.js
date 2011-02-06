var EXPORTED_SYMBOLS = ["Prefs"]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const prefsService = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService)
  .getBranch("conversations.");
const gPrefBranch = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService)
  .getBranch(null);

function PrefManager() {
  this.expand_who = prefsService.getIntPref("expand_who");
  this.no_friendly_date = prefsService.getBoolPref("no_friendly_date");
  this.hide_quote_length = prefsService.getIntPref("hide_quote_length");
  this.monospaced_senders = this.split(prefsService.getCharPref("monospaced_senders"));

  this.register();
}

PrefManager.prototype = {

  split: function (s) Array.map(s.split(","), String.trim).filter(String.trim),

  register: function mpo_register (observer) {
    prefsService.QueryInterface(Components.interfaces.nsIPrefBranch2);
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
        this[aData] = prefsService.getBoolPref(aData);
        break;

      case "expand_who":
      case "hide_quote_length":
        this[aData] = prefsService.getIntPref(aData);
        break;

      case "monospaced_senders":
        this.monospaced_senders = this.split(prefsService.getCharPref("monospaced_senders"));
        break;
    }
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
