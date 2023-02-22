/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, XPCOMUtils, Services */

var lazy = {};

ChromeUtils.defineESModuleGetters(this, {
  DownloadPaths: "resource://gre/modules/DownloadPaths.sys.mjs",
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  GlodaAttrProviders:
    "chrome://conversations/content/modules/GlodaAttrProviders.sys.mjs",
  PluralForm: "resource://gre/modules/PluralForm.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  MailServices: "resource:///modules/MailServices.jsm",
  makeFriendlyDateAgo: "resource:///modules/TemplateUtils.jsm",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
});

// eslint-disable-next-line mozilla/reject-importGlobalProperties
XPCOMUtils.defineLazyGlobalGetters(this, ["TextDecoder"]);

XPCOMUtils.defineLazyGetter(this, "messenger", () =>
  Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger)
);

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    "nsIHandlerService",
  ],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 *
 * @param {string} aUri The URI of the message
 * @returns {nsIMsgDBHdr}
 */
function msgUriToMsgHdr(aUri) {
  try {
    let messageService = messenger.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    console.error("Unable to get ", aUri, " — returning null instead");
    return null;
  }
}

// To help updates to apply successfully, we need to properly unload the modules
// that Conversations loads.
const conversationModules = [
  // Don't unload these until we can find a way of unloading the attribute
  // providers. Unloading these will break gloda when someone updates.
  // "chrome://conversations/content/modules/glodaAttrProviders.sys.mjs",
  "chrome://conversations/content/modules/browserSim.js",
];

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */
/**
 * @typedef nsIURI
 * @see https://searchfox.org/mozilla-central/rev/ac36d76c7aea37a18afc9dd094d121f40f7c5441/netwerk/base/nsIURI.idl
 */

const kAllowRemoteContent = 2;

function monkeyPatchWindow(win, windowId) {
  // Let the stub know we've finished starting.
  win.conversationsFinishedStartup = true;
}

function msgHdrGetUri(aMsg) {
  return aMsg.folder.getUriForMsg(aMsg);
}

/**
 * Handles observing updates on windows.
 */
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

function findAttachment(msgHdr, partName) {
  return new Promise((resolve) => {
    MsgHdrToMimeMessage(msgHdr, null, async (aMsgHdr, aMimeMsg) => {
      if (!aMimeMsg) {
        return;
      }

      // attachmentUrl = unescape(attachmentUrl);
      resolve(aMimeMsg.allUserAttachments.find((x) => x.partName == partName));
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
        async startup() {
          try {
            // Patch all existing windows when the UI is built; all locales should have been loaded here
            // Hook in the embedding and gloda attribute providers.
            GlodaAttrProviders.init();
          } catch (ex) {
            console.error(ex);
          }
          apiMonkeyPatchAllWindows(windowManager, monkeyPatchWindow);
          apiWindowObserver = new ApiWindowObserver(
            windowManager,
            monkeyPatchWindow
          );
          Services.ww.registerNotification(apiWindowObserver);
        },
        async getCorePref(name) {
          try {
            // There are simpler ways to do this, but at the moment it gives
            // an easy list for things we might want to have exposed in the
            // main WebExtension APIs.
            switch (name) {
              case "mailnews.mark_message_read.auto":
              case "mailnews.mark_message_read.delay":
              case "mail.phishing.detection.enabled":
              case "mail.phishing.detection.disallow_form_actions":
              case "mail.showCondensedAddresses":
              case "mailnews.database.global.indexer.enabled":
                return Services.prefs.getBoolPref(name);
              case "font.size.variable.x-western":
              case "mail.forward_message_mode":
              case "mail.openMessageBehavior":
              case "mailnews.mark_message_read.delay.interval":
              case "mail.show_headers":
              case "mailnews.default_sort_order":
              case "mailnews.default_sort_type":
              case "mailnews.default_view_flags":
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
        async setCorePref(name, value) {
          try {
            switch (name) {
              case "mailnews.database.global.indexer.enabled":
                Services.prefs.setBoolPref(name, value);
                break;
              case "mailnews.default_sort_order":
              case "mailnews.default_sort_type":
              case "mailnews.default_view_flags":
                Services.prefs.setIntPref(name, value);
                break;
            }
          } catch (ex) {
            console.error(ex);
          }
        },
        async getLocaleDirection() {
          return Services.locale.isAppLocaleRTL ? "rtl" : "ltr";
        },
        async getMessageIdForUri(uri) {
          const msgHdr = msgUriToMsgHdr(uri);
          if (!msgHdr) {
            return null;
          }
          return (await context.extension.messageManager.convert(msgHdr)).id;
        },
        async getMessageUriForId(id) {
          const msgHdr = context.extension.messageManager.get(id);
          if (!msgHdr) {
            return null;
          }
          return msgHdr.folder.getUriForMsg(msgHdr);
        },
        async formatFileSize(size) {
          return messenger.formatFileSize(size);
        },
        async createTab(createTabProperties) {
          const params = {
            url: createTabProperties.url,
          };
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
            if (messagepane.contentDocument.documentURI.includes("stub.html")) {
              // The best we can do here is to clear via the summary manager,
              // so that we get re-loaded with the new correct size.
              win.gSummaryFrameManager.clear();
            }
          }
        },
        async invalidateCache() {
          Services.obs.notifyObservers(null, "startupcache-invalidate");
        },
        async getLateAttachments(id, extraAttachments) {
          return new Promise((resolve) => {
            const msgHdr = context.extension.messageManager.get(id);
            MsgHdrToMimeMessage(msgHdr, null, (msgHdr, mimeMsg) => {
              if (!mimeMsg) {
                resolve([]);
                return;
              }

              let attachments;
              if (extraAttachments) {
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
                attachments = mimeMsg.allUserAttachments;
              }
              resolve(
                attachments.map((a, i) => {
                  return {
                    size: a.size,
                    contentType: a.contentType,
                    name: a.name,
                    partName: a.partName,
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
          Services.perms.addFromPrincipal(
            Services.scriptSecurityManager.createContentPrincipal(uri, {}),
            "image",
            Services.perms.ALLOW_ACTION
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
        async downloadAllAttachments(id) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachments = await new Promise((resolve) => {
            MsgHdrToMimeMessage(msgHdr, null, async (aMsgHdr, aMimeMsg) => {
              if (!aMimeMsg) {
                return;
              }
              resolve(aMimeMsg.allUserAttachments);
            });
          });
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          win.HandleMultipleAttachments(
            attachments.map((att) => getAttachmentInfo(win, msgUri, att)),
            "save"
          );
        },
        async downloadAttachment(id, partName) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, partName);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          getAttachmentInfo(win, msgUri, attachment).save();
        },
        async openAttachment(id, partName) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, partName);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);

          if (attachment.contentType == "application/pdf") {
            let mimeService = Cc["@mozilla.org/mime;1"].getService(
              Ci.nsIMIMEService
            );
            let handlerInfo = mimeService.getFromTypeAndExtension(
              attachment.contentType,
              null
            );
            // Only open a new tab for pdfs if we are handling them internally.
            if (
              !handlerInfo.alwaysAskBeforeHandling &&
              handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally
            ) {
              // Add the content type to avoid a "how do you want to open this?"
              // dialog. The type may already be there, but that doesn't matter.
              let url = attachment.url;
              if (!url.includes("type=")) {
                url += url.includes("?") ? "&" : "?";
                url += "type=application/pdf";
              }
              let tabmail = win.document.getElementById("tabmail");
              if (!tabmail) {
                // If no tabmail available in this window, try and find it in
                // another.
                let win = Services.wm.getMostRecentWindow("mail:3pane");
                tabmail = win && win.document.getElementById("tabmail");
              }
              if (tabmail) {
                tabmail.openTab("contentTab", {
                  url,
                  background: false,
                  linkHandler: "single-page",
                });
                return;
              }
              // If no tabmail, open PDF same as other attachments.
            }
          }
          let msgService = Cc[
            `@mozilla.org/messenger/messageservice;1?type=${
              Services.io.newURI(msgUri).scheme
            }`
          ].createInstance(Ci.nsIMsgMessageService);

          if (attachment.contentType == "message/rfc822") {
            msgService.openAttachment(
              attachment.contentType,
              encodeURIComponent(attachment.name),
              attachment.url,
              msgUri,
              win.docShell,
              win.msgWindow,
              null
            );
            return;
          }

          // Get the MIME info from the service.
          let mimeInfo;
          try {
            mimeInfo = lazy.gMIMEService.getFromTypeAndExtension(
              attachment.contentType,
              extension
            );
          } catch (ex) {
            // If the call above fails, which can happen on Windows where there's
            // nothing registered for the file type, assume this generic type.
            mimeInfo = lazy.gMIMEService.getFromTypeAndExtension(
              "application/octet-stream",
              ""
            );
          }
          // The default action is saveToDisk, which is not what we want.
          // If we don't have a stored handler, ask before handling.
          if (!lazy.gHandlerService.exists(mimeInfo)) {
            mimeInfo.alwaysAskBeforeHandling = true;
            mimeInfo.preferredAction = Ci.nsIHandlerInfo.alwaysAsk;
          }

          // If we know what to do, do it.

          let { name, url } = attachment;
          name = DownloadPaths.sanitize(name);

          async function saveToFile(path) {
            let buffer = await new Promise(function (resolve, reject) {
              NetUtil.asyncFetch(
                {
                  uri: Services.io.newURI(url),
                  loadUsingSystemPrincipal: true,
                },
                function (inputStream, status) {
                  if (Components.isSuccessCode(status)) {
                    resolve(NetUtil.readInputStream(inputStream));
                  } else {
                    reject(
                      new Components.Exception(
                        "Failed to fetch attachment",
                        status
                      )
                    );
                  }
                }
              );
            });
            await IOUtils.write(path, new Uint8Array(buffer));
          }

          let createTemporaryFileAndOpen = async (mimeInfo) => {
            let tmpPath = PathUtils.join(
              Services.dirsvc.get("TmpD", Ci.nsIFile).path,
              "pid-" + Services.appinfo.processID
            );
            await IOUtils.makeDirectory(tmpPath, { permissions: 0o700 });
            let tempFile = Cc["@mozilla.org/file/local;1"].createInstance(
              Ci.nsIFile
            );
            tempFile.initWithPath(tmpPath);

            tempFile.append(name);
            tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
            tempFile.remove(false);

            Cc["@mozilla.org/uriloader/external-helper-app-service;1"]
              .getService(Ci.nsPIExternalAppLauncher)
              .deleteTemporaryFileOnExit(tempFile);

            await saveToFile(tempFile.path);
            // Before opening from the temp dir, make the file read only so that
            // users don't edit and lose their edits...
            tempFile.permissions = 0o400;
            mimeInfo.launchWithFile(tempFile);
          };

          let openLocalFile = (mimeInfo) => {
            let fileHandler = Services.io
              .getProtocolHandler("file")
              .QueryInterface(Ci.nsIFileProtocolHandler);

            try {
              let externalFile = fileHandler.getFileFromURLSpec(attachment.url);
              mimeInfo.launchWithFile(externalFile);
            } catch (ex) {
              console.error(
                "AttachmentInfo.open: file - ",
                attachment.url,
                ",",
                ex
              );
            }
          };

          if (!mimeInfo.alwaysAskBeforeHandling) {
            switch (mimeInfo.preferredAction) {
              case Ci.nsIHandlerInfo.saveToDisk:
                if (
                  Services.prefs.getBoolPref("browser.download.useDownloadDir")
                ) {
                  let destFile = new FileUtils.File(
                    await Downloads.getPreferredDownloadsDirectory()
                  );
                  destFile.append(name);
                  destFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o755);
                  destFile.remove(false);
                  await saveToFile(destFile.path);
                } else {
                  let filePicker = Cc[
                    "@mozilla.org/filepicker;1"
                  ].createInstance(Ci.nsIFilePicker);
                  filePicker.defaultString = attachment.name;
                  filePicker.defaultExtension = extension;
                  let bundleMessenger =
                    win.document.getElementById("bundle_messenger");
                  filePicker.init(
                    win,
                    bundleMessenger.getString("SaveAttachment"),
                    Ci.nsIFilePicker.modeSave
                  );
                  let rv = await new Promise((resolve) =>
                    filePicker.open(resolve)
                  );
                  if (rv != Ci.nsIFilePicker.returnCancel) {
                    await saveToFile(filePicker.file.path);
                  }
                }
                return;
              case Ci.nsIHandlerInfo.useHelperApp:
              case Ci.nsIHandlerInfo.useSystemDefault:
                // Attachments can be detached and, if this is the case, opened from
                // their location on disk instead of copied to a temporary file.
                if (attachment.isExternalAttachment) {
                  openLocalFile(mimeInfo);

                  return;
                }

                await createTemporaryFileAndOpen(mimeInfo);
                return;
            }
          }

          // Ask what to do, then do it.
          let appLauncherDialog = Cc[
            "@mozilla.org/helperapplauncherdialog;1"
          ].createInstance(Ci.nsIHelperAppLauncherDialog);
          appLauncherDialog.show(
            {
              QueryInterface: ChromeUtils.generateQI(["nsIHelperAppLauncher"]),
              MIMEInfo: mimeInfo,
              source: Services.io.newURI(attachment.url),
              suggestedFileName: attachment.name,
              cancel(reason) {},
              promptForSaveDestination() {
                appLauncherDialog.promptForSaveToFileAsync(
                  attachment,
                  win,
                  attachment.suggestedFileName,
                  "." + extension, // Dot stripped by promptForSaveToFileAsync.
                  false
                );
              },
              launchLocalFile() {
                openLocalFile(mimeInfo);
              },
              async setDownloadToLaunch(handleInternally, file) {
                await createTemporaryFileAndOpen(mimeInfo);
              },
              async saveDestinationAvailable(file) {
                if (file) {
                  await saveToFile(file.path);
                }
              },
              setWebProgressListener(webProgressListener) {},
              targetFile: null,
              targetFileIsExecutable: null,
              timeDownloadStarted: null,
              contentLength: attachment.size,
              browsingContextId: win.getMessagePaneBrowser().browsingContext.id,
            },
            win,
            null
          );
        },
        async detachAttachment(id, partName, shouldSave) {
          let msgHdr = context.extension.messageManager.get(id);
          let attachment = await findAttachment(msgHdr, partName);
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          let msgUri = msgHdrGetUri(msgHdr);
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          messenger.setWindow(win, win.msgWindow);
          let info = getAttachmentInfo(win, msgUri, attachment);
          messenger.detachAttachment(
            info.contentType,
            info.url,
            encodeURIComponent(info.name),
            info.uri,
            shouldSave
          );
        },
        async makeFriendlyDateAgo(date) {
          return makeFriendlyDateAgo(new Date(date));
        },
        /**
         * Use the mailnews component to stream a message, and process it in a way
         *  that's suitable for quoting (strip signature, remove images, stuff like
         *  that).
         *
         * @param {id} id The message id that you want to quote
         * @param {boolean} plainText True if to return the message in plain text format.
         * @returns {Promise}
         *   Returns a quoted string suitable for insertion in an HTML editor.
         */
        quoteMsgHdr(id, plainText) {
          const msgHdr = context.extension.messageManager.get(id);
          return new Promise((resolve) => {
            let chunks = [];
            const decoder = new TextDecoder();
            let listener = {
              /* eslint-disable jsdoc/require-param */
              /** @ignore*/
              setMimeHeaders() {},

              /** @ignore*/
              onStartRequest(aRequest) {},

              /** @ignore*/
              onStopRequest(aRequest, aStatusCode) {
                let data = chunks.join("");
                if (!plainText) {
                  resolve(data);
                  return;
                }
                let parser = Cc["@mozilla.org/parserutils;1"].createInstance(
                  Ci.nsIParserUtils
                );
                let wrapWidth = Services.prefs.getIntPref(
                  "mailnews.wraplength",
                  72
                );
                if (wrapWidth == 0 || wrapWidth > 990) {
                  wrapWidth = 990;
                } else if (wrapWidth < 10) {
                  wrapWidth = 10;
                }
                let flags =
                  Ci.nsIDocumentEncoder.OutputPersistNBSP |
                  Ci.nsIDocumentEncoder.OutputFormatted;

                if (
                  Services.prefs.getBoolPref(
                    "mailnews.send_plaintext_flowed",
                    false
                  )
                ) {
                  flags |= Ci.nsIDocumentEncoder.OutputFormatFlowed;
                }
                resolve(parser.convertToPlainText(data, flags, wrapWidth));
              },

              /** @ignore*/
              onDataAvailable(aRequest, aStream, aOffset, aCount) {
                // Fortunately, we have in Gecko 2.0 a nice wrapper
                let data = NetUtil.readInputStreamToString(aStream, aCount);
                // Now each character of the string is actually to be understood as a byte
                //  of a UTF-8 string.
                // So charCodeAt is what we want here...
                let array = [];
                for (let i = 0; i < data.length; ++i) {
                  array[i] = data.charCodeAt(i);
                }
                // Yay, good to go!
                chunks.push(decoder.decode(Uint8Array.from(array)));
              },
              /* eslint-enable jsdoc/require-param */

              QueryInterface: ChromeUtils.generateQI([
                Ci.nsIStreamListener,
                Ci.nsIMsgQuotingOutputStreamListener,
                Ci.nsIRequestObserver,
                Ci.nsISupportsWeakReference,
              ]),
            };
            // Here's what we want to stream...
            let msgUri = msgHdrGetUri(msgHdr);
            /**
             * Quote a particular message specified by its URI.
             *
             * @param charset optional parameter - if set, force the message to be
             *                quoted using this particular charset
             */
            //   void quoteMessage(in string msgURI, in boolean quoteHeaders,
            //                     in nsIMsgQuotingOutputStreamListener streamListener,
            //                     in string charset, in boolean headersOnly);
            let quoter = Cc[
              "@mozilla.org/messengercompose/quoting;1"
            ].createInstance(Ci.nsIMsgQuote);
            quoter.quoteMessage(msgUri, false, listener, "", false, msgHdr);
          });
        },
        async bodyAsText(winId, msgId) {
          // This function tries to clean up the email's body by removing hidden
          // blockquotes, removing signatures, etc. Note: sometimes there's a little
          // quoted text left over, need to investigate why...
          let win = getWindowFromId(winId);
          let prepare = function (aNode) {
            let node = aNode.cloneNode(true);
            for (let x of node.getElementsByClassName("moz-txt-sig")) {
              if (x) {
                x.remove();
              }
            }
            for (let x of node.querySelectorAll("blockquote, div")) {
              if (x?.style.display == "none") {
                x.remove();
              }
            }
            return node.innerHTML;
          };
          let multimessage = win.document.getElementById("multimessage");
          let messageIframe =
            multimessage.contentDocument.getElementsByClassName(
              `convIframe${msgId}`
            )[0];
          let body = htmlToPlainText(
            prepare(messageIframe.contentDocument.body)
          );
          // Remove trailing newlines, it gives a bad appearance.
          body = body.replace(/[\n\r]*$/, "");
          return body;
        },
        async streamMessage({ winId, tabId, msgId, iframeClass }) {
          let msgHdr = context.extension.messageManager.get(msgId);
          let win;
          let messageIframe;
          if (!tabId) {
            // windowManager only recognises Thunderbird windows, so we can't
            // use getWindowFromId.
            win = Services.wm.getOuterWindowWithId(winId);
            let multimessage = win.document.getElementById("multimessage");
            messageIframe =
              multimessage.contentDocument.getElementsByClassName(
                iframeClass
              )[0];
          } else {
            let tabObject = context.extension.tabManager.get(tabId);
            if (!tabObject.nativeTab) {
              throw new Error("Failed to find tab to stream to.");
            }
            win = Cu.getGlobalForObject(tabObject.nativeTab);
            if (!win) {
              throw new Error(
                "Failed to extract window from tab for streaming"
              );
            }
            if (tabObject.nativeTab.mode.type == "contentTab") {
              if (tabObject.browser.getAttribute("remote")) {
                console.error("Can't stream into a remote browser yet.");
                return false;
              }
              messageIframe =
                tabObject.browser.contentDocument.getElementsByClassName(
                  iframeClass
                )[0];
            } else {
              let multimessage = win.document.getElementById("multimessage");
              messageIframe =
                multimessage.contentDocument.getElementsByClassName(
                  iframeClass
                )[0];
            }
          }

          let uri = msgHdr.folder.getUriForMsg(msgHdr);
          let msgService = messenger.messageServiceFromURI(uri);
          let docShell = messageIframe.contentWindow.docShell;
          docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;

          msgService.DisplayMessage(
            uri + "&markRead=false",
            docShell,
            win.msgWindow,
            undefined,
            undefined,
            {}
          );
          return true;
        },
        /**
         * Wraps the low-level header parser stuff.
         *
         * @param {string} mimeLine
         *   A line that looks like "John &lt;john@cheese.com&gt;, Jane &lt;jane@wine.com&gt;"
         * @returns {Array}
         *   A list of { email, name, fullName } objects
         */
        parseMimeLine(mimeLine) {
          if (mimeLine == null) {
            console.warn("Empty aMimeLine?!!");
            return [{ email: "", name: "-", fullName: "-" }];
          }
          let addresses =
            MailServices.headerParser.parseDecodedHeader(mimeLine);
          if (addresses.length) {
            return addresses.map((addr) => {
              return {
                email: addr.email,
                name: addr.name,
                fullName: addr.toString(),
              };
            });
          }
          return [{ email: "", name: "-", fullName: "-" }];
        },
        convertSnippetToPlainText(accountId, path, text) {
          let msgFolder = context.extension.folderManager.get(accountId, path);
          return msgFolder.convertMsgSnippetToPlainText(text);
        },
        async getAccountOfflineDownload(accountId) {
          let account = MailServices.accounts.getAccount(accountId);
          return account?.incomingServer.QueryInterface(
            Ci.nsIImapIncomingServer
          ).offlineDownload;
        },
        async setAccountOfflineDownload(accountId, value) {
          let account = MailServices.accounts.getAccount(accountId);
          if (account) {
            account.incomingServer.QueryInterface(
              Ci.nsIImapIncomingServer
            ).offlineDownload = value;
          }
        },
        async getFolderOfflineDownload(accountId, path) {
          let folder = extension.folderManager.get(accountId, path);
          return folder.getFlag(Ci.nsMsgFolderFlags.Offline);
        },
        async setFolderOfflineDownload(accountId, path, value) {
          let folder = extension.folderManager.get(accountId, path);
          if (folder) {
            if (value) {
              folder.setFlag(Ci.nsMsgFolderFlags.Offline);
            } else {
              folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
            }
          }
        },
        async getReplyOnTop(identityId) {
          let identity = MailServices.accounts.getIdentity(identityId);
          return identity.replyOnTop;
        },
        async postMessageViaBrowserSim(msg) {
          BrowserSim.sendMessage(msg);
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

/**
 * Convert HTML into text/plain suitable for insertion right away in the mail
 *  body. If there is text with &gt;'s at the beginning of lines, these will be
 *  space-stuffed, and the same goes for Froms. &lt;blockquote&gt;s will be converted
 *  with the suitable &gt;'s at the beginning of the line, and so on...
 * This function also takes care of rewrapping at 72 characters, so your quoted
 *  lines will be properly wrapped too. This means that you can add some text of
 *  your own, and then pass this to simpleWrap, it should "just work" (unless
 *  the user has edited a quoted line and made it longer than 990 characters, of
 *  course).
 *
 * @param {string} aHtml A string containing the HTML that's to be converted.
 * @returns {string} A text/plain string suitable for insertion in a mail body.
 */
function htmlToPlainText(aHtml) {
  // Yes, this is ridiculous, we're instanciating composition fields just so
  //  that they call ConvertBufPlainText for us. But ConvertBufToPlainText
  //  really isn't easily scriptable, so...
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.body = aHtml;
  fields.forcePlainText = true;
  fields.ConvertBodyToPlainText();
  return fields.body;
}
