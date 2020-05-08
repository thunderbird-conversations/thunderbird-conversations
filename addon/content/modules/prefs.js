var EXPORTED_SYMBOLS = ["Prefs"];

/**
 * Preference manager has various values saved on it by the background script,
 * prefs.js, on startup (via the api). These are currently saved here to make
 * it easier for the backend modules to access the preferences whilst we're
 * still working on rewriting them.
 *
 * For the full list, see addon/prefs.js.
 */
class PrefManager {
  constructor() {
    this.kExpandNone = 1;
    this.kExpandAll = 3;
    this.kExpandAuto = 4;
    this.initialized = new Promise(resolve => {
      this.notifyStartupComplete = resolve;
    });
  }

  /**
   * This is a bit of a hack that lets us pretend to set a finished startup
   * preference, but really we're just saying that we're fully initialized.
   */
  set finishedStartup(value) {
    if (value) {
      this.notifyStartupComplete();
    }
  }

  get kStubUrl() {
    return "chrome://conversations/content/stub.xhtml";
  }
}

// Prefs is a singleton.
var Prefs = new PrefManager();
