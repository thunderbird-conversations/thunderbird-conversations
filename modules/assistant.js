var EXPORTED_SYMBOLS = ['Customizations']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const nsMsgFolderFlags_SentMail = 0x00000200;
const nsMsgFolderFlags_Inbox    = 0x00001000;
const nsMsgFolderFlags_Offline  = 0x08000000;
const msgAccountManager = Cc["@mozilla.org/messenger/account-manager;1"]
                            .getService(Ci.nsIMsgAccountManager);
const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);

const kPrefInt = 0, kPrefBool = 1, kPrefChar = 42;

Cu.import("resource:///modules/MailUtils.js"); // for getFolderForURI
Cu.import("resource:///modules/iteratorUtils.jsm"); // for fixIterator
Cu.import("resource:///modules/virtualFolderWrapper.js");
Cu.import("resource:///modules/gloda/index_msg.js");
Cu.import("resource:///modules/gloda/public.js");

Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Assistant");

// Thanks, Andrew!
function get_smart_folder_named(aFolderName) {
  let acctMgr = Cc["@mozilla.org/messenger/account-manager;1"]
                  .getService(Ci.nsIMsgAccountManager);
  let smartServer = acctMgr.FindServer("nobody", "smart mailboxes", "none");
  return smartServer.rootFolder.getChildNamed(aFolderName);
}


function SimpleCustomization(aDesiredValue, aGetter, aSetter) {
  this.desiredValue = aDesiredValue;
  this.get = aGetter;
  this.set = aSetter;
}

SimpleCustomization.prototype = {
  install: function () {
    let oldValue = this.get();
    this.set(this.desiredValue);
    return oldValue;
  },

  uninstall: function (oldValue) {
    let newValue = this.get();
    if (newValue == this.desiredValue) {
      this.set(oldValue);
    }
  },
}


function PrefCustomization({ name, type, value }) {
  this.type = type;
  this.name = name;
  this.desiredValue = value;
  return 
}

PrefCustomization.prototype = {
  get: function () {
    switch (this.type) {
      case kPrefInt:
        return Prefs.getInt(this.name);
      case kPrefChar:
        return Prefs.getChar(this.name);
      case kPrefBool:
        return Prefs.getBool(this.name);
    }
  },

  set: function (aValue) {
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
}

MixIn(PrefCustomization, SimpleCustomization.prototype);


function MultipleCustomization(aParams) {
  this.customizations = [new PrefCustomization(p) for each (p in aParams)];
}

MultipleCustomization.prototype = {
  install: function () {
    return [x.install() for each (x in this.customizations)];
  },

  uninstall: function (uninstallInfos) {
    [x.uninstall(uninstallInfos[i]) for each ([i, x] in Iterator(this.customizations))];
  }
}

// let eid = getMail3Pane().document.getElementById;
//
// The nice idiom above is not possible because of... [Exception...
//  "Illegal operation on WrappedNative prototype object"  nsresult:
//  "0x8057000c (NS_ERROR_XPC_BAD_OP_ON_WN_PROTO)"
// So we do a round of eta-expansion.
let eid = function (id) getMail3Pane().document.getElementById(id);

let Customizations = {
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
    new SimpleCustomization("open", function _getter () {
      return eid("threadpane-splitter").getAttribute("state");
    }, function _setter (aValue) {
      if (aValue != this.get())
        getMail3Pane().goDoCommand('cmd_toggleMessagePane');
    }),

  actionReindexAttachments: {
    install: function () {
      let limit = 8192;
      let popupShown = false;
      let showPopup = function () {
        if (popupShown)
          return;
        popupShown = true;
        getMail3Pane().openDialog(
          "chrome://conversations/content/indexing.xhtml", "",
          "chrome,width=820,height=500"
        );
      };
      let reIndexListener = function () {
        let listener = {
          /* called when new items are returned by the database query or freshly indexed */
          onItemsAdded: function myListener_onItemsAdded(aItems, aCollection) {
          },
          /* called when items that are already in our collection get re-indexed */
          onItemsModified: function myListener_onItemsModified(aItems, aCollection) {
          },
          /* called when items that are in our collection are purged from the system */
          onItemsRemoved: function myListener_onItemsRemoved(aItems, aCollection) {
          },
          /* called when our database query completes */
          onQueryCompleted: function myListener_onQueryCompleted(aCollection) {
            Log.debug("Found", aCollection.items.length, "messages to reindex");
            if (aCollection.items.length == limit)
              showPopup();
            GlodaMsgIndexer.indexMessages([
              [x.folderMessage.folder, x.folderMessage.messageKey]
              for each ([, x] in Iterator(aCollection.items))
              if (x.folderMessage)
            ]);
            Customizations.top();
          }
        };
        return listener;
      };

      let query1 = Gloda.newQuery(Gloda.NOUN_IDENTITY);
      Customizations.expect();
      query1.kind("email");
      query1.value("bugzilla-daemon@mozilla.org");
      query1.getCollection({
        onItemsAdded: function _onItemsAdded(aItems, aCollection) {  },
        onItemsModified: function _onItemsModified(aItems, aCollection) { },
        onItemsRemoved: function _onItemsRemoved(aItems, aCollection) { },
        onQueryCompleted: function _onQueryCompleted(aCollection) {
          if (!aCollection.items.length) {
            Log.debug("Looks like there is no bugmail for this account...");
            Customizations.top();
          } else {
            let query2 = Gloda.newQuery(Gloda.NOUN_MESSAGE);
            query2.from(aCollection.items[0]);
            query2.limit(limit);
            query2.getCollection(reIndexListener()); // will top()
          }
        }
      });

      let query3 = Gloda.newQuery(Gloda.NOUN_MESSAGE);
      Customizations.expect();
      query3.attachmentTypes();
      query3.limit(limit);
      query3.getCollection(reIndexListener()); // will top()
    },

    uninstall: function () {
      // nop
    },
  },

  actionSetupView: {
    install: function () {
      /**
       * const kShowUnthreaded = 0;
       * const kShowThreaded = 1;
       * const kShowGroupedBySort = 2;
       */
      let state = {
        ftvMode: null,
        unreadCol: null,
        senderCol: null,
        initialFolder: {
          uri: null,
          show: null,
        }
      };

      let mainWindow = getMail3Pane();
      let ftv = mainWindow.gFolderTreeView;
      // save the current mode, set to smart
      state.ftvMode = ftv.mode;
      mainWindow.gFolderTreeView.mode = "smart";

      let smartInbox = null;
      try {
        smartInbox = get_smart_folder_named("Inbox");
      } catch (e) {
        Log.debug(e);
        Log.debug("Is there only one account?");
      }
      // Might not be created yet if only one account
      if (smartInbox)
        ftv.selectFolder(smartInbox);

      state.initialFolder.uri = mainWindow.gFolderDisplay.displayedFolder.URI;
      if (mainWindow.gFolderDisplay.view.showUnthreaded)
        state.initialFolder.show = 0;
      else if (mainWindow.gFolderDisplay.view.showThreaded)
        state.initialFolder.show = 1;
      else if (mainWindow.gFolderDisplay.view.showGroupedBySort)
        state.initialFolder.show = 2;

      let moveOn = function () {
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
        eid("unreadCol").setAttribute("hidden", "false");
        eid("senderCol").setAttribute("hidden", "true");
        eid("betweenCol").setAttribute("hidden", "false");
        Customizations.top();
      };
      let i = 0;
      let waitForIt = function () {
        if (smartInbox && mainWindow.gFolderDisplay.displayedFolder != smartInbox && i++ < 10) {
          mainWindow.setTimeout(waitForIt, 150);
        } else {
          moveOn();
        }
      }
      Customizations.expect();
      waitForIt(); // will top()

      return state;
    },

    uninstall: function ({ ftvMode, senderCol, unreadCol, initialFolder }) {
      if (eid("senderCol").getAttribute("hidden") == "true")
        eid("senderCol").setAttribute("hidden", senderCol);
      if (eid("unreadCol").getAttribute("hidden") == "false")
        eid("unreadCol").setAttribute("hidden", unreadCol);
      let mainWindow = getMail3Pane();
      mainWindow.gFolderTreeView.mode = ftvMode;

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
    },
  },

  actionUnifiedInboxSearchesSent: {
    install: function () {
      let changedFolders = {};

      // Get a handle onto the virtual inbox, and mark all the folders it
      //  already searches.
      let smartInbox = null;
      try {
        smartInbox = get_smart_folder_named("Inbox");
      } catch (e) {
        Log.warn(e);
        Log.warn("Is there only one account?");
      }
      if (!smartInbox)
        return changedFolders;

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      let searchFolders = {};
      for each (let [, folder] in Iterator(vFolder.searchFolders)) {
        Log.debug("Folder", folder.folderURL, "is in the unified inbox already");
        searchFolders[folder.folderURL] = true;
      }
      let extraSearchFolders = [];

      // Go through all accounts and through all folders, and add each one
      //  that's either an inbox or a sent folder to the global inbox.
      for each (let account in fixIterator(msgAccountManager.accounts, Ci.nsIMsgAccount)) {
        if (!account.incomingServer)
          continue;

        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);
        rootFolder.ListDescendents(allFolders);
        for each (let folder in fixIterator(allFolders, Ci.nsIMsgFolder)) {
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

    uninstall: function (aChangedFolders) {
      // Just remove from the smart inbox the folders we added if they're still
      //  here.
      let smartInbox = get_smart_folder_named("Inbox");
      if (!smartInbox)
        return;

      let vFolder = VirtualFolderHelper.wrapVirtualFolder(smartInbox);
      vFolder.searchFolders = vFolder.searchFolders.filter(
        function (x) (!(x.URI in aChangedFolders))
      );
      vFolder.cleanUpMessageDatabase();
      msgAccountManager.saveVirtualFolders();
    },

  },

  actionOfflineDownload: {
    install: function () {
      let changedFolders = [];
      let changedServers = [];

      for each (let account in fixIterator(msgAccountManager.accounts, Ci.nsIMsgAccount)) {
        if (!account.incomingServer)
          continue;

        let isImap;
        try {
          account.incomingServer.QueryInterface(Ci.nsIImapIncomingServer);
          isImap = true;
        } catch (e if e.result == Cr.NS_NOINTERFACE) {
          isImap = false;
        }
        if (!isImap)
          continue;

        // Don't forget to restore the pref properly!
        if (!account.incomingServer.offlineDownload) {
          account.incomingServer.offlineDownload = true;
          changedServers.push(account.incomingServer.serverURI);
        }
        let rootFolder = account.incomingServer.rootFolder;
        let allFolders = Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);
        rootFolder.ListDescendents(allFolders);
        for each (let folder in fixIterator(allFolders, Ci.nsIMsgFolder)) {
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

    uninstall: function ([aChangedFolders, aChangedServers]) {
      for each (let uri in aChangedFolders) {
        let folder = MailUtils.getFolderForURI(uri);
        if (folder)
          folder.clearFlag(nsMsgFolderFlags_Offline);
      }
      for each (let aUri in aChangedServers) {
        let uri = ioService.newURI(aUri, null, null);
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
