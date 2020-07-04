var EXPORTED_SYMBOLS = ["Customizations"];

const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Inbox = 0x00001000;
const nsMsgFolderFlags_Offline = 0x08000000;
const msgAccountManager = Cc[
  "@mozilla.org/messenger/account-manager;1"
].getService(Ci.nsIMsgAccountManager);

const kPrefInt = 0,
  kPrefBool = 1,
  kPrefChar = 42;

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  getMail3Pane: "chrome://conversations/content/modules/misc.js",
  fixIterator: "resource:///modules/iteratorUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  Services: "resource://gre/modules/Services.jsm",
  VirtualFolderHelper: "resource:///modules/virtualFolderWrapper.js",
});

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.Assistant");
});

// Thanks, Andrew!
function getSmartFolderNamed(aFolderName) {
  let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"].getService(
    Ci.nsIMsgAccountManager
  );
  let smartServer = acctMgr.FindServer("nobody", "smart mailboxes", "none");
  let smartInbox = null;
  try {
    smartInbox = smartServer.rootFolder.getChildNamed(aFolderName);
  } catch (e) {
    Log.debug(e);
    Log.debug("Is there only one account?");
  }
  return smartInbox;
}

class SimpleCustomization {
  constructor(aDesiredValue, aGetter, aSetter) {
    this.desiredValue = aDesiredValue;
    if (aGetter) {
      this.get = aGetter;
    }
    if (aSetter) {
      this.set = aSetter;
    }
  }

  install() {
    let oldValue = this.get();
    this.set(this.desiredValue);
    return oldValue;
  }

  uninstall(oldValue) {
    let newValue = this.get();
    if (newValue == this.desiredValue) {
      this.set(oldValue);
    }
  }
}

class PrefCustomization extends SimpleCustomization {
  constructor({ name, type, value }) {
    super(value);
    this.type = type;
    this.name = name;
  }

  get() {
    switch (this.type) {
      case kPrefInt:
        return Services.prefs.getIntPref(this.name);
      case kPrefChar:
        return Services.prefs.getCharPref(this.name);
      case kPrefBool:
        return Services.prefs.getBoolPref(this.name);
      default:
        throw new Error(`Unexpected type ${this.type}`);
    }
  }

  set(aValue) {
    switch (this.type) {
      case kPrefInt:
        Services.prefs.setIntPref(this.name, aValue);
        break;
      case kPrefChar:
        Services.prefs.setCharPref(this.name, aValue);
        break;
      case kPrefBool:
        Services.prefs.setBoolPref(this.name, aValue);
        break;
    }
  }
}

class MultipleCustomization {
  constructor(aParams) {
    this.customizations = aParams
      ? aParams.map((p) => new PrefCustomization(p))
      : [];
  }

  install() {
    return this.customizations.map((c) => c.install());
  }

  uninstall(uninstallInfos) {
    this.customizations.forEach(function (x, i) {
      x.uninstall(uninstallInfos[i]);
    });
  }
}

// let eid = getMail3Pane().document.getElementById;
//
// The nice idiom above is not possible because of... [Exception...
//  "Illegal operation on WrappedNative prototype object"  nsresult:
//  "0x8057000c (NS_ERROR_XPC_BAD_OP_ON_WN_PROTO)"
// So we do a round of eta-expansion.
let eid = (id) => getMail3Pane().document.getElementById(id);

var Customizations = {
  actionSetupViewDefaults: new MultipleCustomization([
    { name: "mailnews.default_sort_order", type: kPrefInt, value: 2 },
    { name: "mailnews.default_sort_type", type: kPrefInt, value: 18 },
    { name: "mailnews.default_view_flags", type: kPrefInt, value: 1 },
  ]),

  actionEnableGloda: new PrefCustomization({
    name: "mailnews.database.global.indexer.enabled",
    type: kPrefBool,
    value: true,
  }),

  actionEnsureMessagePaneVisible: new SimpleCustomization(
    "open",
    function _getter() {
      return eid("threadpane-splitter").getAttribute("state");
    },
    function _setter(aValue) {
      if (aValue != this.get()) {
        getMail3Pane().goDoCommand("cmd_toggleMessagePane");
      }
    }
  ),

  actionSetupView: {
    async install() {
      /**
       * const kShowUnthreaded = 0;
       * const kShowThreaded = 1;
       * const kShowGroupedBySort = 2;
       */
      let state = {
        ftvMode: null,
        unreadCol: null,
        senderCol: null,
        correspondentCol: null,
        initialFolder: {
          uri: null,
          show: null,
        },
      };

      let mainWindow = getMail3Pane();
      let ftv = mainWindow.gFolderTreeView;
      // save the current mode, save the current folder, save the current sort
      state.ftvMode = ftv.mode;
      if (mainWindow.gFolderDisplay.displayedFolder) {
        state.initialFolder.uri = mainWindow.gFolderDisplay.displayedFolder.URI;
        if (mainWindow.gFolderDisplay.view.showUnthreaded) {
          state.initialFolder.show = 0;
        } else if (mainWindow.gFolderDisplay.view.showThreaded) {
          state.initialFolder.show = 1;
        } else if (mainWindow.gFolderDisplay.view.showGroupedBySort) {
          state.initialFolder.show = 2;
        }
      }

      // start customizing things
      mainWindow.gFolderTreeView.mode = "smart";

      let smartInbox = getSmartFolderNamed("Inbox");

      // Might not be created yet if only one account
      if (smartInbox) {
        ftv.selectFolder(smartInbox);
      }

      await new Promise((resolve) => {
        let i = 0;
        let waitForIt = function () {
          if (
            smartInbox &&
            mainWindow.gFolderDisplay.displayedFolder != smartInbox &&
            i++ < 10
          ) {
            mainWindow.setTimeout(waitForIt, 150);
          } else {
            resolve();
          }
        };
        waitForIt();
      });

      let tabmail = mainWindow.document.getElementById("tabmail");
      tabmail.switchToTab(0);
      mainWindow.MsgSortThreaded();
      /**
       * We don't know how to revert these, so forget about it for now.
       */
      // mainWindow.MsgSortThreadPane('byDate');
      // mainWindow.MsgSortDescending();
      mainWindow.goDoCommand("cmd_collapseAllThreads");
      state.unreadCol = eid("unreadCol").getAttribute("hidden");
      state.senderCol = eid("senderCol").getAttribute("hidden");
      state.correspondentCol = eid("correspondentCol").getAttribute("hidden");
      eid("unreadCol").setAttribute("hidden", "false");
      eid("senderCol").setAttribute("hidden", "true");
      eid("correspondentCol").setAttribute("hidden", "true");
      eid("betweenCol").setAttribute("hidden", "false");
      return state;
    },

    uninstall({
      ftvMode,
      senderCol,
      unreadCol,
      correspondentCol,
      initialFolder,
    }) {
      if (eid("senderCol").getAttribute("hidden") == "true") {
        eid("senderCol").setAttribute("hidden", senderCol);
      }
      if (eid("unreadCol").getAttribute("hidden") == "true") {
        eid("unreadCol").setAttribute("hidden", unreadCol);
      }
      if (eid("correspondentCol").getAttribute("hidden") == "true") {
        eid("correspondentCol").setAttribute("hidden", correspondentCol);
      }
      let mainWindow = getMail3Pane();
      mainWindow.gFolderTreeView.mode = ftvMode;

      if (initialFolder.uri) {
        const folder = MailUtils.getExistingFolder(initialFolder.uri);
        if (folder) {
          mainWindow.gFolderDisplay.show(folder);
        }
        switch (initialFolder.show) {
          case 0:
            mainWindow.gFolderDisplay.view.showUnthreaded = true;
            break;
          case 1:
            mainWindow.gFolderDisplay.view.showThreaded = true;
            break;
          case 2:
            mainWindow.gFolderDisplay.view.showGroupedBySort = true;
            break;
        }
      }
    },
  },

  actionUnifiedInboxSearchesSent: {
    install() {
      let changedFolders = {};

      // Get a handle onto the virtual inbox, and mark all the folders it
      //  already searches.
      let smartInbox = getSmartFolderNamed("Inbox");

      if (!smartInbox) {
        return changedFolders;
      }

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      let searchFolders = {};
      for (let folder of vFolder.searchFolders) {
        Log.debug(
          "Folder",
          folder.folderURL,
          "is in the unified inbox already"
        );
        searchFolders[folder.folderURL] = true;
      }
      let extraSearchFolders = [];

      // Go through all accounts and through all folders, and add each one
      //  that's either an inbox or a sent folder to the global inbox.
      for (let account of fixIterator(
        msgAccountManager.accounts,
        Ci.nsIMsgAccount
      )) {
        if (!account.incomingServer) {
          continue;
        }

        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = rootFolder.descendants;
        for (let folder of fixIterator(allFolders, Ci.nsIMsgFolder)) {
          if (
            (folder.getFlag(nsMsgFolderFlags_SentMail) ||
              folder.getFlag(nsMsgFolderFlags_Inbox)) &&
            !searchFolders[folder.folderURL]
          ) {
            Log.debug(
              "Searching folder",
              folder.folderURL,
              "inside Global Inbox"
            );
            extraSearchFolders.push(folder);
            changedFolders[folder.URI] = true;
          }
        }
      }
      // And do some magic to make it all work.
      vFolder.searchFolders = vFolder.searchFolders.concat(extraSearchFolders);
      vFolder.cleanUpMessageDatabase();
      msgAccountManager.saveVirtualFolders();

      return changedFolders;
    },

    uninstall(aChangedFolders) {
      // Just remove from the smart inbox the folders we added if they're still
      //  here.
      let smartInbox = getSmartFolderNamed("Inbox");

      if (!smartInbox) {
        return;
      }

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      vFolder.searchFolders = vFolder.searchFolders.filter(
        (x) => !(x.URI in aChangedFolders)
      );
      vFolder.cleanUpMessageDatabase();
      msgAccountManager.saveVirtualFolders();
    },
  },

  actionOfflineDownload: {
    install() {
      let changedFolders = [];
      let changedServers = [];

      for (let account of fixIterator(
        msgAccountManager.accounts,
        Ci.nsIMsgAccount
      )) {
        if (!account.incomingServer) {
          continue;
        }

        let isImap;
        try {
          account.incomingServer.QueryInterface(Ci.nsIImapIncomingServer);
          isImap = true;
        } catch (e) {
          if (e.result == Cr.NS_NOINTERFACE) {
            isImap = false;
          } else {
            throw e;
          }
        }
        if (!isImap) {
          continue;
        }

        // Don't forget to restore the pref properly!
        if (!account.incomingServer.offlineDownload) {
          account.incomingServer.offlineDownload = true;
          changedServers.push(account.incomingServer.serverURI);
        }
        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = rootFolder.descendants;
        for (let folder of fixIterator(allFolders, Ci.nsIMsgFolder)) {
          if (
            (folder.getFlag(nsMsgFolderFlags_SentMail) ||
              folder.getFlag(nsMsgFolderFlags_Inbox)) &&
            !folder.getFlag(nsMsgFolderFlags_Offline)
          ) {
            Log.debug("Marking folder", folder.folderURL, "for offline use");
            folder.setFlag(nsMsgFolderFlags_Offline);
            changedFolders.push(folder.URI);
          }
        }
      }

      return [changedFolders, changedServers];
    },

    uninstall([aChangedFolders, aChangedServers]) {
      for (let uri of aChangedFolders) {
        let folder = MailUtils.getExistingFolder(uri);
        if (folder) {
          folder.clearFlag(nsMsgFolderFlags_Offline);
        }
      }
      for (let aUri of aChangedServers) {
        let uri = Services.io.newURI(aUri);
        let server = msgAccountManager.findServerByURI(uri, false);
        if (server) {
          try {
            server.QueryInterface(Ci.nsIImapIncomingServer);
            server.offlineDownload = false;
          } catch (e) {
            console.error(e);
          }
        }
      }
    },
  },
};
