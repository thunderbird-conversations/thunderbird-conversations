var EXPORTED_SYMBOLS = ['Customizations'];

const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Inbox    = 0x00001000;
const nsMsgFolderFlags_Offline  = 0x08000000;
const msgAccountManager = Cc["@mozilla.org/messenger/account-manager;1"]
                            .getService(Ci.nsIMsgAccountManager);

const kPrefInt = 0, kPrefBool = 1, kPrefChar = 42;

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/MailUtils.js"); // for getFolderForURI
const {fixIterator} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm", {});
const {VirtualFolderHelper} = ChromeUtils.import("resource:///modules/virtualFolderWrapper.js", {});

const {MixIn} = ChromeUtils.import("resource://conversations/modules/stdlib/misc.js", {});
const {getMail3Pane} = ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js", {});
const {Prefs} = ChromeUtils.import("resource://conversations/modules/prefs.js", {});
const {dumpCallStack, setupLogging} = ChromeUtils.import("resource://conversations/modules/log.js", {});

let Log = setupLogging("Conversations.Assistant");

// Thanks, Andrew!
function getSmartFolderNamed(aFolderName) {
  let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"]
                  .getService(Ci.nsIMsgAccountManager);
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


function SimpleCustomization(aDesiredValue, aGetter, aSetter) {
  this.desiredValue = aDesiredValue;
  this.get = aGetter;
  this.set = aSetter;
}

SimpleCustomization.prototype = {
  install() {
    let oldValue = this.get();
    this.set(this.desiredValue);
    return oldValue;
  },

  uninstall(oldValue) {
    let newValue = this.get();
    if (newValue == this.desiredValue) {
      this.set(oldValue);
    }
  },
};


function PrefCustomization({ name, type, value }) {
  this.type = type;
  this.name = name;
  this.desiredValue = value;
}

PrefCustomization.prototype = {
  get() {
    switch (this.type) {
      case kPrefInt:
        return Prefs.getInt(this.name);
      case kPrefChar:
        return Prefs.getChar(this.name);
      case kPrefBool:
        return Prefs.getBool(this.name);
    }
  },

  set(aValue) {
    switch (this.type) {
      case kPrefInt:
        Prefs.setInt(this.name, aValue);
        break;
      case kPrefChar:
        Prefs.setChar(this.name, aValue);
        break;
      case kPrefBool:
        Prefs.setBool(this.name, aValue);
        break;
    }
  },
};

MixIn(PrefCustomization, SimpleCustomization.prototype);


function MultipleCustomization(aParams) {
  this.customizations = aParams ? aParams.map(p => new PrefCustomization(p)) : [];
}

MultipleCustomization.prototype = {
  install() {
    return this.customizations.map(c => c.install());
  },

  uninstall(uninstallInfos) {
    this.customizations.forEach(function(x, i) {
      x.uninstall(uninstallInfos[i]);
    });
  }
};

// let eid = getMail3Pane().document.getElementById;
//
// The nice idiom above is not possible because of... [Exception...
//  "Illegal operation on WrappedNative prototype object"  nsresult:
//  "0x8057000c (NS_ERROR_XPC_BAD_OP_ON_WN_PROTO)"
// So we do a round of eta-expansion.
let eid = id => getMail3Pane().document.getElementById(id);

var Customizations = {
  ttop() {},

  actionSetupViewDefaults: new MultipleCustomization([
    { name: "mailnews.default_sort_order", type: kPrefInt, value: 2 },
    { name: "mailnews.default_sort_type", type: kPrefInt, value: 18 },
    { name: "mailnews.default_view_flags", type: kPrefInt, value: 1 }
  ]),

  actionAttachmentsInline: new PrefCustomization({
    name: "mail.inline_attachments", type: kPrefBool, value: false
  }),

  actionDontExpand: new PrefCustomization({
    name: "mailnews.scroll_to_new_message", type: kPrefBool, value: false
  }),

  actionEnableGloda: new PrefCustomization({
    name: "mailnews.database.global.indexer.enabled", type: kPrefBool, value: true
  }),

  actionEnsureMessagePaneVisible:
    new SimpleCustomization("open", function _getter() {
      return eid("threadpane-splitter").getAttribute("state");
    }, function _setter(aValue) {
      if (aValue != this.get())
        getMail3Pane().goDoCommand('cmd_toggleMessagePane');
    }),

  actionSetupView: {
    install() {
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
        }
      };

      let mainWindow = getMail3Pane();
      let ftv = mainWindow.gFolderTreeView;
      // save the current mode, save the current folder, save the current sort
      state.ftvMode = ftv.mode;
      if (mainWindow.gFolderDisplay.displayedFolder) {
        state.initialFolder.uri = mainWindow.gFolderDisplay.displayedFolder.URI;
        if (mainWindow.gFolderDisplay.view.showUnthreaded)
          state.initialFolder.show = 0;
        else if (mainWindow.gFolderDisplay.view.showThreaded)
          state.initialFolder.show = 1;
        else if (mainWindow.gFolderDisplay.view.showGroupedBySort)
          state.initialFolder.show = 2;
      }

      // start customizing things
      mainWindow.gFolderTreeView.mode = "smart";

      let smartInbox = getSmartFolderNamed("Inbox");

      // Might not be created yet if only one account
      if (smartInbox)
        ftv.selectFolder(smartInbox);

      let moveOn = function() {
        let tabmail = mainWindow.document.getElementById("tabmail");
        tabmail.switchToTab(0);
        mainWindow.MsgSortThreaded();
        /**
         * We don't know how to revert these, so forget about it for now.
         */
        // mainWindow.MsgSortThreadPane('byDate');
        // mainWindow.MsgSortDescending();
        mainWindow.goDoCommand('cmd_collapseAllThreads');
        state.unreadCol = eid("unreadCol").getAttribute("hidden");
        state.senderCol = eid("senderCol").getAttribute("hidden");
        state.correspondentCol = eid("correspondentCol").getAttribute("hidden");
        eid("unreadCol").setAttribute("hidden", "false");
        eid("senderCol").setAttribute("hidden", "true");
        eid("correspondentCol").setAttribute("hidden", "true");
        eid("betweenCol").setAttribute("hidden", "false");
        Customizations.ttop();
      };
      let i = 0;
      let waitForIt = function() {
        if (smartInbox && mainWindow.gFolderDisplay.displayedFolder != smartInbox && i++ < 10) {
          mainWindow.setTimeout(waitForIt, 150);
        } else {
          moveOn();
        }
      };
      Customizations.expect();
      waitForIt(); // will top()

      return state;
    },

    uninstall({ ftvMode, senderCol, unreadCol, correspondentCol, initialFolder }) {
      if (eid("senderCol").getAttribute("hidden") == "true")
        eid("senderCol").setAttribute("hidden", senderCol);
      if (eid("unreadCol").getAttribute("hidden") == "true")
        eid("unreadCol").setAttribute("hidden", unreadCol);
      if (eid("correspondentCol").getAttribute("hidden") == "true")
        eid("correspondentCol").setAttribute("hidden", correspondentCol);
      let mainWindow = getMail3Pane();
      mainWindow.gFolderTreeView.mode = ftvMode;

      if (initialFolder.uri) {
        mainWindow.gFolderDisplay.show(MailUtils.getFolderForURI(initialFolder.uri));
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

      if (!smartInbox)
        return changedFolders;

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      let searchFolders = {};
      for (let folder of vFolder.searchFolders) {
        Log.debug("Folder", folder.folderURL, "is in the unified inbox already");
        searchFolders[folder.folderURL] = true;
      }
      let extraSearchFolders = [];

      // Go through all accounts and through all folders, and add each one
      //  that's either an inbox or a sent folder to the global inbox.
      for (let account of fixIterator(msgAccountManager.accounts, Ci.nsIMsgAccount)) {
        if (!account.incomingServer)
          continue;

        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = rootFolder.descendants;
        for (let folder of fixIterator(allFolders, Ci.nsIMsgFolder)) {
          if ((folder.getFlag(nsMsgFolderFlags_SentMail) || folder.getFlag(nsMsgFolderFlags_Inbox))
              && !searchFolders[folder.folderURL]) {
            Log.debug("Searching folder", folder.folderURL, "inside Global Inbox");
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

      if (!smartInbox)
        return;

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      vFolder.searchFolders = vFolder.searchFolders.filter(
        x => !(x.URI in aChangedFolders)
      );
      vFolder.cleanUpMessageDatabase();
      msgAccountManager.saveVirtualFolders();
    },

  },

  actionOfflineDownload: {
    install() {
      let changedFolders = [];
      let changedServers = [];

      for (let account of fixIterator(msgAccountManager.accounts, Ci.nsIMsgAccount)) {
        if (!account.incomingServer)
          continue;

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
        if (!isImap)
          continue;

        // Don't forget to restore the pref properly!
        if (!account.incomingServer.offlineDownload) {
          account.incomingServer.offlineDownload = true;
          changedServers.push(account.incomingServer.serverURI);
        }
        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = rootFolder.descendants;
        for (let folder of fixIterator(allFolders, Ci.nsIMsgFolder)) {
          if ((folder.getFlag(nsMsgFolderFlags_SentMail) || folder.getFlag(nsMsgFolderFlags_Inbox))
              && !folder.getFlag(nsMsgFolderFlags_Offline)) {
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
        let folder = MailUtils.getFolderForURI(uri);
        if (folder)
          folder.clearFlag(nsMsgFolderFlags_Offline);
      }
      for (let aUri of aChangedServers) {
        let uri = Services.io.newURI(aUri);
        let server = msgAccountManager.findServerByURI(uri, false);
        if (server) {
          try {
            server.QueryInterface(Ci.nsIImapIncomingServer);
            server.offlineDownload = false;
          } catch (e) {
            Log.error(e);
            dumpCallStack(e);
          }
        }
      }
    },
  },
};
