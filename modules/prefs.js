var EXPORTED_SYMBOLS = ["Prefs"]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const prefsService = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService)
  .getBranch("conversations.");

function PrefManager() {
  this.expand_who = prefsService.getIntPref("expand_who");
  this.scroll_who = prefsService.getIntPref("scroll_who");
  this.reverse_order = prefsService.getBoolPref("reverse_order");
  this.no_friendly_date = prefsService.getBoolPref("no_friendly_date");
  this.guess_first_names = prefsService.getBoolPref("guess_first_names");
  this.hide_quote_length = prefsService.getIntPref("hide_quote_length");
  this.monospaced_senders = this.split(prefsService.getCharPref("monospaced_senders"));

  this.register();
}

PrefManager.prototype = {

  split: function (s) Array.map(s.split(","), String.trim),

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
      case "reverse_order":
      case "no_friendly_date":
      case "guess_first_names":
      case "disable_error_empty_collection":
        this[aData] = prefsService.getBoolPref(aData);
        break;

      case "expand_who":
      case "scroll_who":
      case "hide_quote_length":
        this[aData] = prefsService.getIntPref(aData);
        break;

      case "monospaced_senders":
        this.monospaced_senders = this.split(prefsService.getCharPref("monospaced_senders"));
        break;
    }
  }
}

// Prefs is a singleton.
let Prefs = new PrefManager();
