/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

let securityListeners = new Set();
let securityWindowListener = null;
let smimeReloadListeners = new Set();
let smimeReloadWindowListener = null;

function openPgpWaitForWindow(win) {
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

function openPgpMonkeyPatchAllWindows(windowManager, callback, context) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    openPgpWaitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id, context);
    });
  }
}

/**
 * Handles observing updates on windows.
 */
class OpenPgPWindowObserver {
  constructor(windowManager, callback, context) {
    this._windowManager = windowManager;
    this._callback = callback;
    this._context = context;
  }

  observe(subject, topic, data) {
    if (topic != "domwindowopened") {
      return;
    }
    let win = subject;
    openPgpWaitForWindow(win).then(() => {
      if (
        win.document.location != "chrome://messenger/content/messenger.xhtml"
      ) {
        return;
      }
      this._callback(
        subject.window,
        this._windowManager.getWrapper(subject.window).id,
        this._context
      );
    });
  }
}

function getWindow(context, tabId) {
  let tabObject = context.extension.tabManager.get(tabId);
  if (!tabObject.nativeTab) {
    throw new Error("Could not find tab");
  }
  let win = Cu.getGlobalForObject(tabObject.nativeTab);
  if (!win) {
    throw new Error("Could not find window");
  }
  return win;
}

/* exported convOpenPgp */
var convOpenPgp = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;
    return {
      convOpenPgp: {
        beforeStreamingMessage(tabId, msgId, dueToReload) {
          console.log("beforeStreamingMessage", msgId, dueToReload);
          if (!dueToReload) {
            let win = getWindow(context, tabId);
            // TODO: This might not be necessary once decryption handling is
            // in place, but not sure yet.
            win.EnigmailVerify.registerContentTypeHandler();
          }
          // Not sure if we need this or not.
          // win.EnigmailVerify.lastMsgWindow = win.msgWindow;
        },
        handleMessageStreamed(tabId, msgId) {
          console.log("onMessageStreamed", msgId);
        },
        handleTagClick(tabId, msgId) {
          console.log("handleTagClick", tabId, msgId);
          let win = getWindow(context, tabId);
          win.showMessageReadSecurityInfo();
        },
        onUpdateSecurityStatus: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onUpdateSecurityStatus",
          register(fire) {
            if (securityListeners.size == 0) {
              securityWindowListener = new OpenPgPWindowObserver(
                windowManager,
                securityStatusPatch,
                context
              );
              openPgpMonkeyPatchAllWindows(
                windowManager,
                securityStatusPatch,
                context
              );
              Services.ww.registerNotification(securityWindowListener);
            }
            securityListeners.add(fire);

            return function () {
              securityListeners.delete(fire);
              if (securityListeners.size == 0) {
                Services.ww.unregisterNotification(securityWindowListener);
                openPgpMonkeyPatchAllWindows(windowManager, (win, id) => {
                  let headerSink = win.Enigmail.hdrView.headerPane;
                  headerSink.updateSecurityStatus =
                    win.oldOnUpdateSecurityStatus;
                  headerSink.processDecryptionResult =
                    win.oldProcessDecryptionResult;
                });
              }
            };
          },
        }).api(),
        onSMIMEReload: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onSMIMEReload",
          register(fire) {
            if (smimeReloadListeners.size == 0) {
              smimeReloadWindowListener = new OpenPgPWindowObserver(
                windowManager,
                smimeReloadPatch,
                context
              );
              openPgpMonkeyPatchAllWindows(
                windowManager,
                smimeReloadPatch,
                context
              );
              Services.ww.registerNotification(smimeReloadWindowListener);
            }
            smimeReloadListeners.add(fire);

            return function () {
              smimeReloadListeners.delete(fire);
              if (smimeReloadListeners.size == 0) {
                Services.ww.unregisterNotification(smimeReloadWindowListener);
                openPgpMonkeyPatchAllWindows(windowManager, (win, id) => {
                  let headerSink = win.Enigmail.hdrView.headerPane;
                  headerSink.handleSMimeMessage = win.oldHandleSMimeMessage;
                });
              }
            };
          },
        }).api(),
      },
    };
  }
};

const smimeReloadPatch = (win, id, context) => {
  let headerSink = win.Enigmail.hdrView.headerPane;
  win.oldHandleSMimeMessage = headerSink.handleSMimeMessage;

  let messagepane = win.document.getElementById("messagepane");

  headerSink.handleSMimeMessage = function (uri) {
    // Use original if the classic reader is used.
    // Use original if the classic reader is used. If the contentDocument
    // does not exist, then the single view message pane hasn't been loaded
    // yet, so therefore the message must be loading in our window.
    if (
      messagepane.contentDocument &&
      messagepane.contentDocument.location.href !== "about:blank?"
    ) {
      win.oldHandleSMimeMessage.apply(this, arguments);
      return;
    }
    let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    let id = context.extension.messageManager.convert(msgHdr).id;

    win.EnigmailVerify.unregisterContentTypeHandler();

    for (let listener of smimeReloadListeners) {
      listener.async(id);
    }
  };
};

const securityStatusPatch = (win, id, context) => {
  let headerSink = win.Enigmail.hdrView.headerPane;
  win.oldOnUpdateSecurityStatus = headerSink.updateSecurityStatus;
  win.oldProcessDecryptionResult = headerSink.processDecryptionResult;

  headerSink.processDecryptionResult = () => {};

  let messagepane = win.document.getElementById("messagepane");

  // Called after decryption or verification is completed.
  // Security status of a message is updated and shown at the status bar
  // and the header box.
  headerSink.updateSecurityStatus = function (
    unusedUriSpec,
    exitCode,
    statusFlags,
    extStatusFlags,
    keyId,
    userId,
    sigDetails,
    errorMsg,
    blockSeparation,
    uri,
    extraDetails,
    mimePartNumber
  ) {
    console.log(statusFlags);
    // Use original if the classic reader is used. If the contentDocument
    // does not exist, then the single view message pane hasn't been loaded
    // yet, so therefore the message must be loading in our window.
    if (
      messagepane.contentDocument &&
      messagepane.contentDocument.location.href !== "about:blank?"
    ) {
      win.oldOnUpdateSecurityStatus.apply(this, arguments);
      return;
    }
    // let message;
    let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    let id = context.extension.messageManager.convert(msgHdr).id;
    // if (win.Conversations.currentConversation) {
    //   let uriSpec = msgHdrGetUri(msgHdr);
    //   message = w.Conversations.currentConversation.getMessage(uriSpec);
    // }
    // if (!message) {
    //   console.error("Message for the security info not found!");
    //   return;
    // }
    // if (message._updateHdrIcons) {
    //   // _updateHdrIcons is assigned if this is called before.
    //   // This function will be called twice a PGP/MIME encrypted message.
    //   return;
    // }

    (async () => {
      // Non-encrypted message may have decrypted labela since
      // message.isEncrypted is true for only signed pgp/mime message.
      // We reset decrypted label from decryption status.
      let encryptionStatus;
      let encryptionNotification;
      if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
        console.log("encrypted OK!");
        encryptionStatus = "good";
        // addEncryptedTag(message);
      } else if (statusFlags & EnigmailConstants.NO_SECKEY) {
        encryptionNotification = await win.document.l10n.formatValue(
          "openpgp-cannot-decrypt-because-missing-key"
        );
        encryptionStatus = "bad";
      } else if (statusFlags & EnigmailConstants.MISSING_MD) {
        encryptionNotification = await win.document.l10n.formatValue(
          "openpgp-cannot-decrypt-because-mdc"
        );
        encryptionStatus = "bad";
      }

      // let encToDetails = "";
      // if (extraDetails?.length) {
      //   let o = JSON.parse(extraDetails);
      //   if ("encryptedTo" in o) {
      //     encToDetails = o.encryptedTo;
      //   }
      // }
      //
      // let updateHdrIcons = function () {
      //   win.Enigmail.hdrView.updateHdrIcons(
      //     exitCode,
      //     statusFlags,
      //     extStatusFlags,
      //     keyId,
      //     userId,
      //     sigDetails,
      //     errorMsg,
      //     blockSeparation,
      //     encToDetails,
      //     null
      //   ); // xtraStatus
      // };
      // showHdrIconsOnStreamed(message, updateHdrIcons);

      // Maybe show signed label of encrypted and signed pgp/mime.
      let signedStatus = getSignedStatus(statusFlags);
      for (let listener of securityListeners) {
        listener.async({
          id,
          signedStatus,
          encryptionStatus,
          encryptionNotification,
        });
      }
    })();
  };
};

// Add signed label and click action to a signed message.
function getSignedStatus(statusFlags) {
  if (statusFlags & EnigmailConstants.GOOD_SIGNATURE) {
    return "good";
  }
  if (
    statusFlags &
    (EnigmailConstants.EXPIRED_KEY_SIGNATURE |
      EnigmailConstants.EXPIRED_SIGNATURE |
      EnigmailConstants.UNCERTAIN_SIGNATURE |
      EnigmailConstants.EXPIRED_KEY_SIGNATURE |
      EnigmailConstants.EXPIRED_SIGNATURE |
      EnigmailConstants.UNVERIFIED_SIGNATURE)
  ) {
    return "warn";
  }

  if (
    statusFlags &
    (EnigmailConstants.BAD_SIGNATURE | EnigmailConstants.REVOKED_KEY)
  ) {
    return "bad";
  }
  return undefined;
}
