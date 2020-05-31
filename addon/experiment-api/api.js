var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  Customizations: "chrome://conversations/content/modules/assistant.js",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  GlodaAttrProviders:
    "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
  MonkeyPatch: "chrome://conversations/content/modules/monkeypatch.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/mimemsg.js",
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
  "chrome://conversations/content/modules/monkeypatch.js",
  "chrome://conversations/content/modules/prefs.js",
];

// Note: we must not use any modules until after initialization of prefs,
// otherwise the prefs might not get loaded correctly.
XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.AssistantUI");
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

function monkeyPatchWindow(window, windowId) {
  let doIt = async function () {
    try {
      if (
        window.document.location !=
          "chrome://messenger/content/messenger.xul" &&
        window.document.location != "chrome://messenger/content/messenger.xhtml"
      ) {
        return;
      }
      Log.debug("The window looks like a mail:3pane, monkey-patching...");

      // Insert our own global Conversations object
      window.Conversations = {
        // These two belong here, use getMail3Pane().Conversations to access them
        monkeyPatch: null,
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
          window.Conversations.draftListeners[aId] = [];
        },
      };

      // We instantiate the Monkey-Patch for the given Conversation object.
      let monkeyPatch = new MonkeyPatch(window, windowId);
      // And then we seize the window and insert our code into it
      await monkeyPatch.apply();

      // Used by the in-stub.html detachTab function
      window.Conversations.monkeyPatch = monkeyPatch;

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
      monkeyPatch.finishedStartup = true;
      /* eslint-enable no-unused-vars */
    } catch (e) {
      Cu.reportError(e);
    }
  };

  if (window.document.readyState == "complete") {
    Log.debug("Document is ready...");
    doIt().catch(console.error);
  } else {
    Log.debug(
      `Document is not ready (${window.document.readyState}), waiting...`
    );
    window.addEventListener(
      "load",
      () => {
        doIt().catch(console.error);
      },
      { once: true }
    );
  }
}

function monkeyPatchAllWindows(windowManager) {
  for (let w of Services.wm.getEnumerator("mail:3pane")) {
    monkeyPatchWindow(w, windowManager.getWrapper(w).id);
  }
}

// This obserer is notified when a new window is created and injects our code
let windowObserver = {
  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      if (aSubject && "QueryInterface" in aSubject) {
        aSubject.QueryInterface(Ci.nsIDOMWindow);
        monkeyPatchWindow(
          aSubject.window,
          BrowserSim._context.extension.windowManager.getWrapper(
            aSubject.window
          ).id
        );
      }
    }
  },
};

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

    Services.ww.unregisterNotification(windowObserver);

    for (let w of Services.wm.getEnumerator("mail:3pane")) {
      if ("Conversations" in w) {
        w.Conversations.monkeyPatch.undo();
      }
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
              monkeyPatchAllWindows(windowManager);

              // Patch all future windows
              Services.ww.registerNotification(windowObserver);
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
              case "mailnews.mark_message_read.delay.interval":
              case "mail.openMessageBehavior":
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
              this,
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
          Services.wm
            .getMostRecentWindow("mail:3pane")
            .document.getElementById("tabmail")
            .openTab(createTabProperties.type, params);
        },
        async getIsJunk(id) {
          const msgHdr = context.extension.messageManager.get(id);
          return (
            msgHdr.getStringProperty("junkscore") ==
            Ci.nsIJunkMailPlugin.IS_SPAM_SCORE
          );
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
                attachments.filter((a) => {
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
      },
    };
  }
};
