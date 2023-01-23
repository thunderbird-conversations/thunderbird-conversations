/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, ExtensionUtils, XPCOMUtils, Services */

var lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AttachmentInfo: "resource:///modules/AttachmentInfo.sys.mjs",
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

ChromeUtils.defineLazyGetter(this, "messenger", () =>
  Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger)
);

var { ExtensionError } = ExtensionUtils;

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 *
 * @param {string} aUri The URI of the message
 * @returns {nsIMsgDBHdr}
 */
function msgUriToMsgHdr(aUri) {
  try {
    let messageService = MailServices.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    console.error("Unable to get ", aUri, " — returning null instead", e);
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

function msgHdrGetUri(aMsg) {
  return aMsg.folder.getUriForMsg(aMsg);
}

function getAttachmentInfo(msgUri, attachment) {
  const attInfo = new lazy.AttachmentInfo({
    contentType: attachment.contentType,
    url: attachment.url,
    name: attachment.name,
    uri: msgUri,
    isExternalAttachment: attachment.isExternal,
  });
  attInfo.size = attachment.size;
  if (attInfo.size != -1) {
    attInfo.sizeResolved = true;
  }
  return attInfo;
}

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

function getWinBrowserFromIds(context, winId, tabId) {
  if (!tabId) {
    // windowManager only recognises Thunderbird windows, so we can't
    // use getWindowFromId.
    let win = Services.wm.getOuterWindowWithId(winId);

    return {
      // windowManager only recognises Thunderbird windows, so we can't
      // use getWindowFromId.
      win,
      msgBrowser: win.document.getElementById("multiMessageBrowser"),
    };
  }

  let tabObject = context.extension.tabManager.get(tabId);
  if (!tabObject.nativeTab) {
    throw new Error("Failed to find tab");
  }
  let win = Cu.getGlobalForObject(tabObject.nativeTab);
  if (!win) {
    throw new Error("Failed to extract window from tab");
  }
  if (tabObject.nativeTab.mode.type == "contentTab") {
    return { win, msgBrowser: tabObject.browser };
  }
  return {
    win,
    msgBrowser:
      tabObject.nativeTab.chromeBrowser.contentWindow.multiMessageBrowser,
  };
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
    return {
      conversations: {
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
            const messagepane = win.document.getElementById(
              "multiMessageBrowser"
            );
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
          return new Promise((resolve, reject) => {
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
          let [makePluralFn] = lazy.PluralForm.makeGetter(pluralForm);
          return makePluralFn(value, message).replace("#1", value);
        },
        async markSelectedAsJunk(tabId, isJunk) {
          let tabObject = context.extension.tabManager.get(tabId);
          if (!tabObject.nativeTab) {
            throw new Error("Failed to find tab");
          }
          tabObject.nativeTab.chromeBrowser.contentWindow.commandController.doCommand(
            isJunk ? "cmd_markAsJunk" : "cmd_markAsNotJunk"
          );
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
          // We don't need to supply a nsIMsgWindow here, the window is only
          // used for news messages, and probably wouldn't be used for view
          // source at all.
          let url = MailServices.mailSession.ConvertMsgURIToMsgURL(
            msgHdrGetUri(msgHdr),
            null
          );
          win.openDialog(
            "chrome://messenger/content/viewSource.xhtml",
            "_blank",
            "all,dialog=no",
            { URL: url }
          );
        },
        async openInClassic(id) {
          const win = Services.wm.getMostRecentWindow("mail:3pane");
          const msgHdr = context.extension.messageManager.get(id);
          const tabmail = win.document.getElementById("tabmail");
          tabmail.openTab("mailMessageTab", {
            messageURI: msgHdr.folder.getUriForMsg(msgHdr),
            background: false,
          });
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
        async downloadAllAttachments({ winId, tabId, msgId }) {
          let msgHdr = context.extension.messageManager.get(msgId);
          let { win } = getWinBrowserFromIds(context, winId, tabId);
          let attachments = await new Promise((resolve) => {
            MsgHdrToMimeMessage(msgHdr, null, async (aMsgHdr, aMimeMsg) => {
              if (!aMimeMsg) {
                return;
              }
              resolve(aMimeMsg.allUserAttachments);
            });
          });
          let msgUri = msgHdrGetUri(msgHdr);
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          messenger.setWindow(
            win,
            Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
              Ci.nsIMsgWindow
            )
          );

          // Taken from HandleMultipleAttachments
          // https://searchfox.org/comm-central/rev/9548311ac3161a8801fa61785c7185eb278b5bbb/mail/base/content/msgHdrView.js#2154

          let contentTypeArray = [];
          let urlArray = [];
          let displayNameArray = [];
          let messageUriArray = [];

          for (let [i, attachment] of attachments.entries()) {
            // Exclude attachment which are 1) deleted, or 2) detached with missing
            // external files, unless copying urls.
            if (
              attachment.contentType == "text/x-moz-deleted" ||
              attachment.url?.startsWith("file://")
            ) {
              continue;
            }

            contentTypeArray[i] = attachment.contentType;
            urlArray[i] = attachment.url;
            displayNameArray[i] = encodeURI(attachment.name);
            messageUriArray[i] = msgUri;
          }

          messenger.saveAllAttachments(
            contentTypeArray,
            urlArray,
            displayNameArray,
            messageUriArray
          );
        },
        async downloadAttachment({ winId, tabId, msgId, partName }) {
          let { win } = getWinBrowserFromIds(context, winId, tabId);
          let msgHdr = context.extension.messageManager.get(msgId);
          let attachment = await findAttachment(msgHdr, partName);
          let msgUri = msgHdrGetUri(msgHdr);
          // Unfortunately, we still need a messenger with a msgWindow for
          // this to work.
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          messenger.setWindow(
            win,
            Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
              Ci.nsIMsgWindow
            )
          );
          getAttachmentInfo(msgUri, attachment).save(messenger);
        },
        async openAttachment({ winId, tabId, msgId, partName }) {
          let msgHdr = context.extension.messageManager.get(msgId);
          if (!msgHdr) {
            throw new ExtensionError(`Message not found: ${msgId}.`);
          }
          let attachment = await getAttachment(msgHdr, partName);
          if (!attachment) {
            throw new ExtensionError(
              `Part ${partName} not found in message ${msgId}.`
            );
          }
          let attachmentInfo = new lazy.AttachmentInfo({
            contentType: attachment.contentType,
            url: attachment.url,
            name: attachment.name,
            uri: msgHdr.folder.getUriForMsg(msgHdr),
            isExternalAttachment: attachment.isExternal,
            message: msgHdr,
          });
          let { msgBrowser } = getWinBrowserFromIds(context, winId, tabId);
          try {
            await attachmentInfo.open(msgBrowser.browsingContext);
          } catch (ex) {
            throw new ExtensionError(
              `Part ${partName} could not be opened: ${ex}.`
            );
          }
        },
        async detachAttachment({ winId, tabId, msgId, partName, shouldSave }) {
          let { win } = getWinBrowserFromIds(context, winId, tabId);
          let msgHdr = context.extension.messageManager.get(msgId);
          let attachment = await findAttachment(msgHdr, partName);
          let msgUri = msgHdrGetUri(msgHdr);
          // Unfortunately, we still need a messenger with a msgWindow for
          // this to work.
          let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
            Ci.nsIMessenger
          );
          messenger.setWindow(
            win,
            Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
              Ci.nsIMsgWindow
            )
          );
          getAttachmentInfo(msgUri, attachment).detach(messenger, shouldSave);
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
        async bodyAsText({ winId, tabId, msgId }) {
          let { msgBrowser } = getWinBrowserFromIds(context, winId, tabId);
          // This function tries to clean up the email's body by removing hidden
          // blockquotes, removing signatures, etc. Note: sometimes there's a little
          // quoted text left over, need to investigate why...
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
          let messageIframe = msgBrowser.contentDocument.getElementsByClassName(
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
          let { win, msgBrowser } = getWinBrowserFromIds(context, winId, tabId);

          if (msgBrowser.getAttribute("remote")) {
            console.error("Can't stream into a remote browser yet.");
            return false;
          }

          let messageIframe =
            msgBrowser.contentDocument.getElementsByClassName(iframeClass)[0];

          let uri = msgHdr.folder.getUriForMsg(msgHdr);
          let msgService = MailServices.messageServiceFromURI(uri);
          let docShell = messageIframe.contentWindow.docShell;

          docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
          messageIframe.setAttribute("uri", uri);

          msgService.loadMessage(
            uri + "&markRead=false",
            docShell,
            win.msgWindow,
            undefined,
            undefined,
            {}
          );
          return true;
        },
        async fireLoadCompleted({ winId, tabId }) {
          let { msgBrowser } = getWinBrowserFromIds(context, winId, tabId);
          msgBrowser.ownerGlobal.dispatchEvent(
            new msgBrowser.ownerGlobal.CustomEvent("MsgsLoaded", {
              bubbles: true,
            })
          );
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
            // This is called on startup, so hook in the gloda attribute
            // providers.
            try {
              lazy.GlodaAttrProviders.init();
            } catch (ex) {
              console.error(ex);
            }

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

/**
 * Functions below taken from Thunderbird.
 * https://searchfox.org/comm-central/rev/50e5ac35216ab14c0e9f8ae941815702c97ec1f3/mail/components/extensions/parent/ext-messages.js
 */

/**
 * @typedef {object} nsIMsgHdr
 */
/**
 * @typedef {object} MimeMessagePart
 */

/**
 * Returns the attachment identified by the provided partName.
 *
 * @param {nsIMsgHdr} msgHdr
 * @param {string} partName
 * @returns {Promise<MimeMessagePart>}
 */
async function getAttachment(msgHdr, partName) {
  // It's not ideal to have to call MsgHdrToMimeMessage here again, but we need
  // the name of the attached file, plus this also gives us the URI without having
  // to jump through a lot of hoops.
  let attachment = await getMimeMessage(msgHdr, partName);
  if (!attachment) {
    return null;
  }

  return attachment;
}

/**
 * Returns MIME parts found in the message identified by the given nsIMsgHdr.
 *
 * @param {nsIMsgHdr} msgHdr
 * @param {string} partName - Return only a specific mime part.
 * @returns {Promise<MimeMessagePart>}
 */
async function getMimeMessage(msgHdr, partName = "") {
  // If this message is a sub-message (an attachment of another message), get the
  // mime parts of the parent message and return the part of the sub-message.
  let subMsgPartName = getSubMessagePartName(msgHdr);
  if (subMsgPartName) {
    let parentMsgHdr = getParentMsgHdr(msgHdr);
    if (!parentMsgHdr) {
      return null;
    }

    let mimeMsg = await getMimeMessage(parentMsgHdr, partName);
    if (!mimeMsg) {
      return null;
    }

    // If <partName> was specified, the returned mime message is just that part,
    // no further processing needed. But prevent x-ray vision into the parent.
    if (partName) {
      if (partName.split(".").length > subMsgPartName.split(".").length) {
        return mimeMsg;
      }
      return null;
    }

    // Limit mimeMsg and attachments to the requested <subMessagePart>.
    let findSubPart = (parts, partName) => {
      let match = parts.find((a) => partName.startsWith(a.partName));
      if (!match) {
        throw new ExtensionError(
          `Unexpected Error: Part ${partName} not found.`
        );
      }
      return match.partName == partName
        ? match
        : findSubPart(match.parts, partName);
    };
    let subMimeMsg = findSubPart(mimeMsg.parts, subMsgPartName);

    if (mimeMsg.attachments) {
      subMimeMsg.attachments = mimeMsg.attachments.filter(
        (a) =>
          a.partName != subMsgPartName && a.partName.startsWith(subMsgPartName)
      );
    }
    return subMimeMsg;
  }

  let mimeMsg = await new Promise((resolve) => {
    MsgHdrToMimeMessage(
      msgHdr,
      null,
      (_msgHdr, mimeMsg) => {
        mimeMsg.attachments = mimeMsg.allInlineAttachments;
        resolve(mimeMsg);
      },
      true,
      { examineEncryptedParts: true }
    );
  });

  return partName
    ? mimeMsg.attachments.find((a) => a.partName == partName)
    : mimeMsg;
}

/**
 * Returns the <part> parameter of the dummyMsgUrl of the provided nsIMsgHdr.
 *
 * @param {nsIMsgHdr} msgHdr
 * @returns {string}
 */
function getSubMessagePartName(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return "";
  }

  return new URL(msgHdr.getStringProperty("dummyMsgUrl")).searchParams.get(
    "part"
  );
}

/**
 * Returns the nsIMsgHdr of the outer message, if the provided nsIMsgHdr belongs
 * to a message which is actually an attachment of another message. Returns null
 * otherwise.
 *
 * @param {nsIMsgHdr} msgHdr
 * @returns {nsIMsgHdr}
 */
function getParentMsgHdr(msgHdr) {
  if (msgHdr.folder || !msgHdr.getStringProperty("dummyMsgUrl")) {
    return null;
  }

  let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));

  if (url.protocol == "news:") {
    let newsUrl = `news-message://${url.hostname}/${url.searchParams.get(
      "group"
    )}#${url.searchParams.get("key")}`;
    return messenger.msgHdrFromURI(newsUrl);
  }

  // TODO: Maybe support this
  // if (url.protocol == "mailbox:") {
  //   // This could be a sub-message of a message opened from file.
  //   let fileUrl = `file://${url.pathname}`;
  //   let parentMsgHdr = messageTracker._dummyMessageHeaders.get(fileUrl);
  //   if (parentMsgHdr) {
  //     return parentMsgHdr;
  //   }
  // }
  // Everything else should be a mailbox:// or an imap:// url.
  let params = Array.from(url.searchParams, (p) => p[0]).filter(
    (p) => !["number"].includes(p)
  );
  for (let param of params) {
    url.searchParams.delete(param);
  }
  return Services.io.newURI(url.href).QueryInterface(Ci.nsIMsgMessageUrl)
    .messageHeader;
}
