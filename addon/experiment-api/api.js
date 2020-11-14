var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  Customizations: "chrome://conversations/content/modules/assistant.js",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  GlodaAttrProviders:
    "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
  makeFriendlyDateAgo: "resource:///modules/TemplateUtils.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  msgUriToMsgHdr: "chrome://conversations/content/modules/misc.js",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  Sqlite: "resource://gre/modules/Sqlite.jsm",
  OS: "resource://gre/modules/osfile.jsm",
});

XPCOMUtils.defineLazyGetter(this, "MsgHdrToMimeMessage", () => {
  let tmp = {};
  try {
    ChromeUtils.import("resource:///modules/gloda/mimemsg.js", tmp);
  } catch (ex) {
    ChromeUtils.import("resource:///modules/gloda/MimeMessage.jsm", tmp);
  }
  return tmp.MsgHdrToMimeMessage;
});

const FILE_SIMPLE_STORAGE = "simple_storage.sqlite";
const SIMPLE_STORAGE_TABLE_NAME = "conversations";

// To help updates to apply successfully, we need to properly unload the modules
// that Conversations loads.
const conversationModules = [
  "chrome://conversations/content/modules/plugins/dkimVerifier.js",
  "chrome://conversations/content/modules/plugins/enigmail.js",
  // Don't unload these until we can find a way of unloading the attribute
  // providers. Unloading these will break gloda when someone updates.
  // "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
  // "chrome://conversations/content/modules/plugins/helpers.js",
  "chrome://conversations/content/modules/plugins/lightning.js",
  "chrome://conversations/content/modules/assistant.js",
  "chrome://conversations/content/modules/browserSim.js",
  "chrome://conversations/content/modules/contact.js",
  "chrome://conversations/content/modules/conversation.js",
  "chrome://conversations/content/modules/hook.js",
  "chrome://conversations/content/modules/message.js",
  "chrome://conversations/content/modules/misc.js",
  "chrome://conversations/content/modules/prefs.js",
];

const kAllowRemoteContent = 2;

// Note: we must not use any modules until after initialization of prefs,
// otherwise the prefs might not get loaded correctly.
XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.api");
});

function StreamListener(resolve, reject) {
  return {
    _data: "",
    _stream: null,

    QueryInterface: ChromeUtils.generateQI([
      Ci.nsIStreamListener,
      Ci.nsIRequestObserver,
    ]),

    onStartRequest(aRequest) {},
    onStopRequest(aRequest, aStatusCode) {
      try {
        resolve(this._data);
      } catch (e) {
        reject("Error inside stream listener:\n" + e + "\n");
      }
    },

    onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
      if (this._stream == null) {
        this._stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
          Ci.nsIBinaryInputStream
        );
        this._stream.setInputStream(aInputStream);
      }
      this._data += this._stream.readBytes(aCount);
    },
  };
}

function prefType(name) {
  switch (name) {
    case "no_friendly_date":
    case "logging_enabled":
    case "tweak_bodies":
    case "tweak_chrome":
    case "operate_on_conversations":
    case "extra_attachments":
    case "compose_in_tab":
    case "hide_sigs": {
      return "bool";
    }
    case "expand_who":
    case "hide_quote_length": {
      return "int";
    }
    case "unwanted_recipients":
    case "uninstall_infos": {
      return "char";
    }
  }
  throw new Error(`Unexpected pref type ${name}`);
}

function monkeyPatchWindow(win, windowId) {
  Log.debug("monkey-patching...");

  // Insert our own global Conversations object
  win.Conversations = {
    // key: Message-ID
    // value: a list of listeners
    msgListeners: new Map(),
    // key: Gloda Conversation ID
    // value: a list of listeners that have a onDraftChanged method
    draftListeners: {},

    // These two are replicated in the case of a conversation tab, so use
    //  Conversation._window.Conversations to access the right instance
    currentConversation: null,
    counter: 0,

    createDraftListenerArrayForId(aId) {
      win.Conversations.draftListeners[aId] = [];
    },
  };

  // The modules below need to be loaded when a window exists, i.e. after
  // overlays have been properly loaded and applied
  /* eslint-disable no-unused-vars */
  ChromeUtils.import(
    "chrome://conversations/content/modules/plugins/enigmail.js"
  );
  ChromeUtils.import(
    "chrome://conversations/content/modules/plugins/lightning.js"
  );
  ChromeUtils.import(
    "chrome://conversations/content/modules/plugins/dkimVerifier.js"
  );
  win.Conversations.finishedStartup = true;
}

class ApiWindowObserver {
  constructor(windowManager, callback) {
    this._windowManager = windowManager;
    this._callback = callback;
  }

  observe(subject, topic, data) {
    if (topic != "domwindowopened") {
      return;
    }
    let win;
    if (subject && "QueryInterface" in subject) {
      // Supports pre-TB 70.
      win = subject.QueryInterface(Ci.nsIDOMWindow).window;
    } else {
      win = subject;
    }
    apiWaitForWindow(win).then(() => {
      if (
        win.document.location != "chrome://messenger/content/messenger.xul" &&
        win.document.location != "chrome://messenger/content/messenger.xhtml"
      ) {
        return;
      }
      this._callback(
        subject.window,
        this._windowManager.getWrapper(subject.window).id
      );
    });
  }
}

function apiWaitForWindow(win) {
  return new Promise((resolve) => {
    if (win.document.readyState == "complete") {
      resolve();
    } else {
      win.addEventListener(
        "load",
        () => {
          resolve();
        },
        { once: true }
      );
    }
  });
}

function apiMonkeyPatchAllWindows(windowManager, callback) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    apiWaitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id);
    });
  }
}

function getAttachmentInfo(win, msgUri, attachment) {
  const attInfo = new win.AttachmentInfo(
    attachment.contentType,
    attachment.url,
    attachment.name,
    msgUri,
    attachment.isExternal
  );
  attInfo.size = attachment.size;
  if (attInfo.size != -1) {
    attInfo.sizeResolved = true;
  }
  return attInfo;
}

let apiWindowObserver;

function findAttachment(msgHdr, attachmentUrl) {
  return new Promise((resolve) => {
    MsgHdrToMimeMessage(msgHdr, null, async (aMsgHdr, aMimeMsg) => {
      if (!aMimeMsg) {
        return;
      }

      attachmentUrl = unescape(attachmentUrl);
      resolve(
        aMimeMsg.allUserAttachments.find(
          (x) => unescape(x.url) == attachmentUrl
        )
      );
    });
  });
}

/* exported conversations */
var conversations = class extends ExtensionCommon.ExtensionAPI {
  onStartup() {
    const aomStartup = Cc[
      "@mozilla.org/addons/addon-manager-startup;1"
    ].getService(Ci.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI(
      "manifest.json",
      null,
      this.extension.rootURI
    );
    this.chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "conversations", "content/"],
    ]);
  }

  onShutdown(isAppShutdown) {
    Log.debug("shutdown, isApp=", isAppShutdown);
    if (isAppShutdown) {
      return;
    }

    if (apiWindowObserver) {
      Services.ww.unregisterNotification(apiWindowObserver);
    }

    BrowserSim.setBrowserListener(null);

    for (const module of conversationModules) {
      Cu.unload(module);
    }

    this.chromeHandle.destruct();
    this.chromeHandle = null;

    Services.obs.notifyObservers(null, "startupcache-invalidate");
  }
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;
    return {
      conversations: {
        async setPref(name, value) {
          Prefs[name] = value;

          if (name == "finishedStartup") {
            Log.debug("startup");

            try {
              // Patch all existing windows when the UI is built; all locales should have been loaded here
              // Hook in the embedding and gloda attribute providers.
              GlodaAttrProviders.init();
              apiMonkeyPatchAllWindows(windowManager, monkeyPatchWindow);
              apiWindowObserver = new ApiWindowObserver(
                windowManager,
                monkeyPatchWindow
              );
              Services.ww.registerNotification(apiWindowObserver);
            } catch (ex) {
              console.error(ex);
            }
          }
        },
        async getPref(name) {
          try {
            switch (prefType(name)) {
              case "bool": {
                return Services.prefs.getBoolPref(`conversations.${name}`);
              }
              case "int": {
                return Services.prefs.getIntPref(`conversations.${name}`);
              }
              case "char": {
                return Services.prefs.getCharPref(`conversations.${name}`);
              }
            }
          } catch (ex) {
            return undefined;
          }
          throw new Error("Unexpected pref type");
        },
        async getCorePref(name) {
          try {
            // There are simpler ways to do this, but at the moment it gives
            // an easy list for things we might want to have exposed in the
            // main WebExtension APIs.
            switch (name) {
              case "mailnews.mark_message_read.auto":
              case "mailnews.mark_message_read.delay":
              case "mail.showCondensedAddresses":
                return Services.prefs.getBoolPref(name);
              case "font.size.variable.x-western":
              case "mail.forward_message_mode":
              case "mail.openMessageBehavior":
              case "mailnews.mark_message_read.delay.interval":
              case "mail.show_headers":
                return Services.prefs.getIntPref(name);
              case "browser.display.foreground_color":
              case "browser.display.background_color":
                return Services.prefs.getCharPref(name);
            }
          } catch (ex) {
            // Do nothing
          }
          return undefined;
        },
        async getLocaleDirection() {
          return Services.locale.isAppLocaleRTL ? "rtl" : "ltr";
        },
        async installCustomisations(ids) {
          let uninstallInfos = JSON.parse(Prefs.uninstall_infos);
          for (const id of ids) {
            if (!(id in Customizations)) {
              Log.error("Couldn't find a suitable customization for", id);
            } else {
              try {
                Log.debug("Installing customization", id);
                let uninstallInfo = await Customizations[id].install();
                uninstallInfos[id] = uninstallInfo;
              } catch (ex) {
                console.error("Error in customization", id, ex);
              }
            }
          }

          return JSON.stringify(uninstallInfos);
        },
        async undoCustomizations() {
          for (let win of Services.wm.getEnumerator("mail:3pane")) {
            // Switch to a 3pane view (otherwise the "display threaded"
            // customization is not reverted)
            let tabmail = win.document.getElementById("tabmail");
            if (tabmail.tabContainer.selectedIndex != 0) {
              tabmail.tabContainer.selectedIndex = 0;
            }
          }

          let uninstallInfos = JSON.parse(Prefs.uninstall_infos);
          for (let [k, v] of Object.entries(Customizations)) {
            if (k in uninstallInfos) {
              try {
                Log.debug("Uninstalling", k, uninstallInfos[k]);
                v.uninstall(uninstallInfos[k]);
              } catch (ex) {
                console.error("Failed to uninstall", k, ex);
              }
            }
          }
        },
        async getLegacyStorageData() {
          const path = OS.Path.join(
            OS.Constants.Path.profileDir,
            FILE_SIMPLE_STORAGE
          );
          const fileExists = await OS.File.exists(path);
          if (!fileExists) {
            return [];
          }

          const dbConnection = await Sqlite.openConnection({
            path,
          });

          const exists = await dbConnection.tableExists(
            SIMPLE_STORAGE_TABLE_NAME
          );
          if (!exists) {
            return [];
          }
          let rows = await dbConnection.execute(
            `SELECT key, value FROM ${SIMPLE_STORAGE_TABLE_NAME}`
          );

          await dbConnection.close();

          return rows.map((row) => {
            return {
              key: row.getResultByName("key"),
              value: JSON.parse(row.getResultByName("value")),
            };
          });
        },
        async getMessageIdForUri(uri) {
          const msgHdr = msgUriToMsgHdr(uri);
          if (!msgHdr) {
            return null;
          }
          return context.extension.messageManager.convert(msgHdr).id;
        },
        async getMessageUriForId(id) {
          const msgHdr = context.extension.messageManager.get(id);
          if (!msgHdr) {
            return null;
          }
          return msgHdr.folder.getUriForMsg(msgHdr);
        },
        async getAttachmentBody(id, partName) {
          const msgHdr = context.extension.messageManager.get(id);
          return new Promise((resolve, reject) => {
            MsgHdrToMimeMessage(
              msgHdr,
              null,
              (mimeHdr, aMimeMsg) => {
                const attachments = aMimeMsg.allAttachments.filter(
                  (x) => x.partName == partName
                );
                const msgUri = Services.io.newURI(attachments[0].url);
                const tmpChannel = NetUtil.newChannel({
                  uri: msgUri,
                  loadUsingSystemPrincipal: true,
                });
                tmpChannel.asyncOpen(
                  new StreamListener(resolve, reject),
                  msgUri
                );
              },
              true,
              {
                partsOnDemand: false,
                examineEncryptedParts: true,
              }
            );
          });
        },
        async formatFileSize(size) {
          const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          return messenger.formatFileSize(size);
        },
        async createTab(createTabProperties) {
          const params = {};
          if (createTabProperties.type == "contentTab") {
            params.contentPage = createTabProperties.url;
          } else {
            params.chromePage = createTabProperties.url;
          }
          getWindowFromId(createTabProperties.windowId)
            .document.getElementById("tabmail")
            .openTab(createTabProperties.type, params);
        },
        async createFilter(email, windowId) {
          getWindowFromId(windowId).MsgFilters(email, null);
        },
        async resetMessagePane() {
          for (const win of Services.wm.getEnumerator("mail:3pane")) {
            const messagepane = win.document.getElementById("multimessage");
            if (
              messagepane.contentDocument.documentURI.includes("stub.xhtml")
            ) {
              // The best we can do here is to clear via the summary manager,
              // so that we get re-loaded with the new correct size.
              win.gSummaryFrameManager.clear();
            }
          }
        },
        async invalidateCache() {
          Services.obs.notifyObservers(null, "startupcache-invalidate");
        },
        async getLateAttachments(id) {
          return new Promise((resolve) => {
            const msgHdr = context.extension.messageManager.get(id);
            MsgHdrToMimeMessage(msgHdr, null, (msgHdr, mimeMsg) => {
              if (!mimeMsg) {
                resolve([]);
                return;
              }

              let attachments;
              if (Prefs.extra_attachments) {
                attachments = [
                  ...mimeMsg.allAttachments,
                  ...mimeMsg.allUserAttachments,
                ];
                let seenMap = new Set();
                attachments = attachments.filter((a) => {
                  const seen = seenMap.has(a);
                  seenMap.add(a);
                  return !seen;
                });
              } else {
                attachments = mimeMsg.allUserAttachments.filter(
                  (a) => a.isRealAttachment
                );
              }
              resolve(
                attachments.map((a, i) => {
                  return {
                    size: a.size,
                    contentType: a.contentType,
                    isExternal: a.isExternal,
                    name: a.name,
                    url: a.url,
                    anchor: "msg" + this.initialPosition + "att" + i,
                  };
                })
              );
            });
          });
        },
        async makePlural(pluralForm, message, value) {
          let [makePluralFn] = PluralForm.makeGetter(pluralForm);
          return makePluralFn(value, message).replace("#1", value);
        },
        async markSelectedAsJunk(isJunk) {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          win.JunkSelectedMessages(isJunk);
          win.SetFocusThreadPane();
        },
        async switchToFolderAndMsg(id) {
          const msgHdr = context.extension.messageManager.get(id);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          win.gFolderTreeView.selectFolder(msgHdr.folder, true);
          win.gFolderDisplay.selectMessage(msgHdr);
        },
        async sendUnsent() {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          if (Services.io.offline) {
            win.MailOfflineMgr.goOnlineToSendMessages(win.msgWindow);
          } else {
            win.SendUnsentMessages();
          }
        },
        async openInSourceView(id) {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          const msgHdr = context.extension.messageManager.get(id);
          if (!msgHdr) {
            throw new Error("Could not find message");
          }
          win.ViewPageSource([msgHdr.folder.getUriForMsg(msgHdr)]);
        },
        async openInClassic(id) {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          const msgHdr = context.extension.messageManager.get(id);
          const tabmail = win.document.getElementById("tabmail");
          tabmail.openTab("message", { msgHdr, background: false });
        },
        async showRemoteContent(id) {
          const msgHdr = context.extension.messageManager.get(id);
          msgHdr.setUint32Property("remoteContentPolicy", kAllowRemoteContent);
        },
        async alwaysShowRemoteContent(email) {
          const uri = Services.io.newURI(
            "chrome://messenger/content/email=" + email
          );
          // TB 78: If we have createContentPrincipal we're in the TB 78+ code.
          if ("createContentPrincipal" in Services.scriptSecurityManager) {
            Services.perms.addFromPrincipal(
              Services.scriptSecurityManager.createContentPrincipal(uri, {}),
              "image",
              Services.perms.ALLOW_ACTION
            );
          } else {
            Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
          }
        },
        async beginReply(id, type) {
          let msgHdr = context.extension.messageManager.get(id);
          let compType;
          switch (type) {
            case "replyToSender":
              compType = Ci.nsIMsgCompType.ReplyToSender;
              break;
            case "replyToAll":
              compType = Ci.nsIMsgCompType.ReplyAll;
              break;
            case "replyToList":
              compType = Ci.nsIMsgCompType.ReplyToList;
              break;
          }
          Services.wm
            .getMostRecentWindow("mail:3pane")
            .ComposeMessage(
              compType,
              Ci.nsIMsgCompFormat.Default,
              msgHdr.folder,
              [msgHdr.folder.getUriForMsg(msgHdr)]
            );
        },
        async beginForward(id, type) {
          let msgHdr = context.extension.messageManager.get(id);
          let compType =
            type == "forwardAsAttachment"
              ? Ci.nsIMsgCompType.ForwardAsAttachment
              : Ci.nsIMsgCompType.ForwardInline;
          Services.wm
            .getMostRecentWindow("mail:3pane")
            .ComposeMessage(
              compType,
              Ci.nsIMsgCompFormat.Default,
              msgHdr.folder,
              [msgHdr.folder.getUriForMsg(msgHdr)]
            );
        },
        async beginEdit(id, type) {
          let msgHdr = context.extension.messageManager.get(id);
          let compType =
            type == "editAsNew"
              ? Ci.nsIMsgCompType.Template
              : Ci.nsIMsgCompType.Draft;
          Services.wm
            .getMostRecentWindow("mail:3pane")
            .ComposeMessage(
              compType,
              Ci.nsIMsgCompFormat.Default,
              msgHdr.folder,
              [msgHdr.folder.getUriForMsg(msgHdr)]
            );
        },
        async ignorePhishing(id) {
          let msgHdr = context.extension.messageManager.get(id);
          msgHdr.setUint32Property("notAPhishMessage", 1);
          // Force a commit of the underlying msgDatabase.
          msgHdr.folder.msgDatabase = null;
        },
        async getFolderName(id) {
          let msgHdr = context.extension.messageManager.get(id);
          let folderStr = msgHdr.folder.prettyName;
          let folder = msgHdr.folder;
          while (folder.parent) {
            folder = folder.parent;
            folderStr = folder.name + "/" + folderStr;
          }
          return folderStr;
        },
        async downloadAllAttachments(id) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachments = await new Promise((resolve) => {
            MsgHdrToMimeMessage(msgHdr, null, async (aMsgHdr, aMimeMsg) => {
              if (!aMimeMsg) {
                return;
              }
              resolve(
                aMimeMsg.allUserAttachments.filter((x) => x.isRealAttachment)
              );
            });
          });
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          win.HandleMultipleAttachments(
            attachments.map((att) => getAttachmentInfo(win, msgUri, att)),
            "save"
          );
        },
        async downloadAttachment(id, attachmentUrl) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, attachmentUrl);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          getAttachmentInfo(win, msgUri, attachment).save();
        },
        async openAttachment(id, attachmentUrl) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, attachmentUrl);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          getAttachmentInfo(win, msgUri, attachment).open();
        },
        async detachAttachment(id, attachmentUrl, shouldSave) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, attachmentUrl);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          getAttachmentInfo(win, msgUri, attachment).detach(shouldSave);
        },
        async makeFriendlyDateAgo(date) {
          return makeFriendlyDateAgo(new Date(date));
        },
        onCallAPI: new ExtensionCommon.EventManager({
          context,
          name: "conversations.onCallAPI",
          register(fire) {
            function callback(apiName, apiItem, ...args) {
              return fire.async(apiName, apiItem, args);
            }

            BrowserSim.setBrowserListener(callback, context);
            return function () {
              BrowserSim.setBrowserListener(null);
            };
          },
        }).api(),
        onCorePrefChanged: new ExtensionCommon.EventManager({
          context,
          name: "conversations.onCorePrefChanged",
          register(fire, prefName) {
            const observer = {
              observe(subject, topic, data) {
                if (topic == "nsPref:changed" && data == prefName) {
                  const prefType = Services.prefs.getPrefType(prefName);
                  switch (prefType) {
                    case 32: {
                      fire.async(Services.prefs.getStringPref(prefName));
                      break;
                    }
                    case 64: {
                      fire.async(Services.prefs.getIntPref(prefName));
                      break;
                    }
                    case 128: {
                      fire.async(Services.prefs.getBoolPref(prefName));
                      break;
                    }
                  }
                }
              },
            };
            Services.prefs.addObserver(prefName, observer);
            return () => {
              Services.prefs.removeObserver(prefName, observer);
            };
          },
        }).api(),
        onSetConversationPreferences: new ExtensionCommon.EventManager({
          context,
          name: "conversations.onSetConversationPreferences",
          register(fire) {
            const overridePrefs = [
              "mail.inline_attachments",
              "mailnews.scroll_to_new_message",
            ];
            let oldValues = new Map();
            for (let pref of overridePrefs) {
              // Only try and change if we have to, so that we're toggling less.
              if (Services.prefs.getBoolPref(pref, true)) {
                oldValues.set(pref, true);
                Services.prefs.setBoolPref(pref, false);
              }
            }
            return () => {
              for (let pref of overridePrefs) {
                if (oldValues.has(pref)) {
                  Services.prefs.setBoolPref(pref, oldValues.get(pref));
                }
              }
            };
          },
        }).api(),
      },
    };
  }
};

function getWindowFromId(windowManager, context, id) {
  return id !== null && id !== undefined
    ? windowManager.get(id, context).window
    : Services.wm.getMostRecentWindow("mail:3pane");
}
