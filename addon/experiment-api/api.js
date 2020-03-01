var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ConversationUtils: "chrome://conversations/content/modules/conversation.js",
  Customizations: "chrome://conversations/content/modules/assistant.js",
  dumpCallStack: "chrome://conversations/content/modules/log.js",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  MsgHdrToMimeMessage: "resource:///modules/gloda/mimemsg.js",
  msgUriToMsgHdr:
    "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
  setupLogging: "chrome://conversations/content/modules/log.js",
  Sqlite: "resource://gre/modules/Sqlite.jsm",
  OS: "resource://gre/modules/osfile.jsm",
});

const FILE_SIMPLE_STORAGE = "simple_storage.sqlite";
const SIMPLE_STORAGE_TABLE_NAME = "conversations";

// Note: we must not use any modules until after initialization of prefs,
// otherwise the prefs might not get loaded correctly.
let Log = null;

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
    case "enabled":
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

/* exported conversations */
var conversations = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      conversations: {
        async setPref(name, value) {
          Prefs[name] = value;
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
        async installCustomisations(ids) {
          let uninstallInfos = JSON.parse(Prefs.uninstall_infos);
          if (!Log) {
            Log = setupLogging("Conversations.AssistantUI");
          }
          for (const id of ids) {
            if (!(id in Customizations)) {
              Log.error("Couldn't find a suitable customization for", id);
            } else {
              try {
                Log.debug("Installing customization", id);
                let uninstallInfo = await Customizations[id].install();
                uninstallInfos[id] = uninstallInfo;
              } catch (e) {
                Log.error("Error in customization", id);
                Log.error(e);
                dumpCallStack(e);
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

          return rows.map(row => {
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
        async getAttachmentBody(id, partName) {
          const msgHdr = context.extension.messageManager.get(id);
          return new Promise((resolve, reject) => {
            MsgHdrToMimeMessage(
              msgHdr,
              this,
              (mimeHdr, aMimeMsg) => {
                const attachments = aMimeMsg.allAttachments.filter(
                  x => x.partName == partName
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
        onCallAPI: new ExtensionCommon.EventManager({
          context,
          name: "conversations.onCallAPI",
          register(fire) {
            function callback(apiName, apiItem, ...args) {
              return fire.async(apiName, apiItem, args);
            }

            ConversationUtils.setBrowserListener(callback);
            return function() {
              ConversationUtils.setBrowserListener(null);
            };
          },
        }).api(),
      },
    };
  }
};
