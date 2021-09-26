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
let signedStatusListeners = new Set();
let signedStatusListener = null;

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
          // Can't do anything in the custom standalone message window at the moment.
          if (tabId == -1) {
            return;
          }

          if (!dueToReload) {
            let win = getWindow(context, tabId);
            // TODO: This might not be necessary once decryption handling is
            // in place, but not sure yet.
            win.EnigmailVerify.registerContentTypeHandler();
          }
          // Not sure if we need this or not.
          // win.EnigmailVerify.lastMsgWindow = win.msgWindow;
        },
        handleMessageStreamed(tabId, msgId) {},
        handleTagClick(tabId, msgId) {
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
        onSignedStatus: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onSignedStatus",
          register(fire) {
            if (signedStatusListeners.size == 0) {
              signedStatusListener = new OpenPgPWindowObserver(
                windowManager,
                signedStatusPatch,
                context
              );
              openPgpMonkeyPatchAllWindows(
                windowManager,
                signedStatusPatch,
                context
              );
              Services.ww.registerNotification(signedStatusListener);
            }
            signedStatusListeners.add(fire);

            return function () {
              signedStatusListeners.delete(fire);
              if (signedStatusListeners.size == 0) {
                Services.ww.unregisterNotification(signedStatusListener);
                openPgpMonkeyPatchAllWindows(windowManager, (win, id) => {
                  let headerSink = win.smimeHeaderSink;
                  headerSink.signedStatus = win.oldSignedStatus;
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

const signedStatusPatch = (win, id, context) => {
  let headerSink = win.smimeHeaderSink;
  win.oldSignedStatus = headerSink.signedStatus.bind(headerSink);
  headerSink.signedStatus = function (
    nestingLevel,
    signatureStatus,
    signerCert,
    msgNeckoURL
  ) {
    if (nestingLevel > 1) {
      return;
    }
    let neckoURL = Services.io.newURI(msgNeckoURL);
    let msgHdr = neckoURL.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    let id = context.extension.messageManager.convert(msgHdr).id;

    let signedStatus = "bad";
    if (signatureStatus == Ci.nsICMSMessageErrors.SUCCESS) {
      signedStatus = "good";
    }
    let details = loadSmimeMessageSecurityInfo(
      win,
      signatureStatus,
      signerCert
    );
    for (let listener of signedStatusListeners) {
      listener.async({
        id,
        signedStatus,
        details,
      });
    }
    win.oldSignedStatus(nestingLevel, signatureStatus, signerCert, msgNeckoURL);
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

    let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    let id = context.extension.messageManager.convert(msgHdr).id;

    (async () => {
      // Non-encrypted message may have decrypted label since
      // message.isEncrypted is true for only signed pgp/mime message.
      // We reset decrypted label from decryption status.
      let encryptionStatus;
      let encryptionNotification;
      if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
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

      let encToDetails = "";
      if (extraDetails?.length) {
        let o = JSON.parse(extraDetails);
        if ("encryptedTo" in o) {
          encToDetails = o.encryptedTo;
        }
      }
      win.Enigmail.hdrView.updateHdrIcons(
        exitCode,
        statusFlags,
        extStatusFlags,
        keyId,
        userId,
        sigDetails,
        errorMsg,
        blockSeparation,
        encToDetails,
        null
      ); // xtraStatus

      loadOpenPgpMessageSecurityInfo(win).then(
        ({ encyptDetails, signedDetails }) => {
          // Maybe show signed label of encrypted and signed pgp/mime.
          let signedStatus = getSignedStatus(statusFlags);
          for (let listener of securityListeners) {
            listener.async({
              id,
              encryptionStatus,
              encryptionNotification,
              details: encyptDetails,
            });
            listener.async({
              id,
              signedStatus,
              details: signedDetails,
            });
          }
        }
      );
    })();
  };
};

/**
 * Populate the message security popup panel with SMIME data.
 *
 * This is a custom version of the one in Thunderbird from
 * https://searchfox.org/comm-esr91/rev/71dc348f732115af9f342e514e3b6f0e2a5f1808/mailnews/extensions/smime/msgReadSMIMEOverlay.js#49
 *
 * @param {object} win
 *   The window the security info is being obtained from.
 * @param {number} signatureStatus
 * @param {object} signerCert
 */
function loadSmimeMessageSecurityInfo(win, signatureStatus, signerCert) {
  let sBundle = win.document.getElementById("bundle_smime_read_info");

  if (!sBundle) {
    return null;
  }

  let sigInfoLabel = null;
  let sigInfoHeader = null;
  let sigInfo = null;
  let sigInfo_clueless = false;

  switch (signatureStatus) {
    case -1:
    case Ci.nsICMSMessageErrors.VERIFY_NOT_SIGNED:
      sigInfoLabel = "SINoneLabel";
      sigInfo = "SINone";
      break;

    case Ci.nsICMSMessageErrors.SUCCESS:
      sigInfoLabel = "SIValidLabel";
      sigInfo = "SIValid";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_BAD_SIGNATURE:
    case Ci.nsICMSMessageErrors.VERIFY_DIGEST_MISMATCH:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIContentAltered";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_UNKNOWN_ALGO:
    case Ci.nsICMSMessageErrors.VERIFY_UNSUPPORTED_ALGO:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIInvalidCipher";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_HEADER_MISMATCH:
      sigInfoLabel = "SIPartiallyValidLabel";
      sigInfoHeader = "SIPartiallyValidHeader";
      sigInfo = "SIHeaderMismatch";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_CERT_WITHOUT_ADDRESS:
      sigInfoLabel = "SIPartiallyValidLabel";
      sigInfoHeader = "SIPartiallyValidHeader";
      sigInfo = "SICertWithoutAddress";
      break;

    case Ci.nsICMSMessageErrors.VERIFY_UNTRUSTED:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo = "SIUntrustedCA";
      // XXX Need to extend to communicate better errors
      // might also be:
      // SIExpired SIRevoked SINotYetValid SIUnknownCA SIExpiredCA SIRevokedCA SINotYetValidCA
      break;

    case Ci.nsICMSMessageErrors.VERIFY_NOT_YET_ATTEMPTED:
    case Ci.nsICMSMessageErrors.GENERAL_ERROR:
    case Ci.nsICMSMessageErrors.VERIFY_NO_CONTENT_INFO:
    case Ci.nsICMSMessageErrors.VERIFY_BAD_DIGEST:
    case Ci.nsICMSMessageErrors.VERIFY_NOCERT:
    case Ci.nsICMSMessageErrors.VERIFY_ERROR_UNVERIFIED:
    case Ci.nsICMSMessageErrors.VERIFY_ERROR_PROCESSING:
    case Ci.nsICMSMessageErrors.VERIFY_MALFORMED_SIGNATURE:
      sigInfoLabel = "SIInvalidLabel";
      sigInfoHeader = "SIInvalidHeader";
      sigInfo_clueless = true;
      break;
    default:
      Cu.reportError("Unexpected gSignatureStatus: " + signatureStatus);
  }

  let signatureExplanation = "";
  if (sigInfoHeader) {
    signatureExplanation += sBundle.getString(sigInfoHeader);
  }
  if (sigInfo) {
    signatureExplanation += "\n" + sBundle.getString(sigInfo);
  } else if (sigInfo_clueless) {
    signatureExplanation +=
      "\n" + sBundle.getString("SIClueless") + " (" + signatureStatus + ")";
  }

  return {
    signatureLabel: sBundle.getString(sigInfoLabel),
    signatureExplanation,
    signerCert: {
      name: signerCert.commonName,
      email: signerCert.emailAddress,
      issuerName: signerCert.issuerCommonName,
    },
  };
}

/**
 * Populate the message security popup panel with OpenPGP data.
 *
 * This is a custom version of the one in Thunderbird from
 * https://searchfox.org/comm-central/rev/66f17f6f4d6f0509fe3672081e3b912513a19f0a/mailnews/extensions/smime/msgReadSMIMEOverlay.js#306
 *
 * @param {object} win
 *   The window the security info is being obtained from.
 */
async function loadOpenPgpMessageSecurityInfo(win) {
  let sBundle = win.document.getElementById("bundle_smime_read_info");

  if (!sBundle) {
    return null;
  }

  let hdrView = win.Enigmail.hdrView;
  let l10n = win.document.l10n;

  let hasAnySig = true;
  let sigInfoLabel = null;
  let sigInfo = null;

  switch (hdrView.msgSignatureState) {
    case EnigmailConstants.MSG_SIG_NONE:
      sigInfoLabel = "openpgp-no-sig";
      sigInfo = "SINone";
      hasAnySig = false;
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-no-key";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_UID_MISMATCH:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-uid-mismatch";
      break;

    case EnigmailConstants.MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED:
      sigInfoLabel = "openpgp-uncertain-sig";
      sigInfo = "openpgp-sig-uncertain-not-accepted";
      break;

    case EnigmailConstants.MSG_SIG_INVALID_KEY_REJECTED:
      sigInfoLabel = "openpgp-invalid-sig";
      sigInfo = "openpgp-sig-invalid-rejected";
      break;

    case EnigmailConstants.MSG_SIG_INVALID:
      sigInfoLabel = "openpgp-invalid-sig";
      sigInfo = "openpgp-sig-invalid-technical-problem";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_UNVERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-unverified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_KEY_VERIFIED:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-verified";
      break;

    case EnigmailConstants.MSG_SIG_VALID_SELF:
      sigInfoLabel = "openpgp-good-sig";
      sigInfo = "openpgp-sig-valid-own-key";
      break;

    default:
      console.error(
        "Unexpected msgSignatureState: " + hdrView.msgSignatureState
      );
  }

  let encInfoLabel = null;
  let encInfo = null;

  switch (hdrView.msgEncryptionState) {
    case EnigmailConstants.MSG_ENC_NONE:
      encInfoLabel = "EINoneLabel2";
      encInfo = "EINone";
      break;

    case EnigmailConstants.MSG_ENC_NO_SECRET_KEY:
      encInfoLabel = "EIInvalidLabel";
      encInfo = "EIInvalidHeader";
      break;

    case EnigmailConstants.MSG_ENC_FAILURE:
      encInfoLabel = "EIInvalidLabel";
      encInfo = "EIClueless";
      break;

    case EnigmailConstants.MSG_ENC_OK:
      encInfoLabel = "EIValidLabel";
      encInfo = "EIValid";
      break;

    default:
      console.error(
        "Unexpected msgEncryptionState: " + hdrView.msgEncryptionState
      );
  }

  let signedDetails = {
    signatureLabel: await l10n.formatValue(sigInfoLabel),
    signatureExplanation: hasAnySig
      ? // eslint-disable-next-line mozilla/prefer-formatValues
        await l10n.formatValue(sigInfo)
      : sBundle.getString(sigInfo),
  };
  let encyptDetails = {
    encryptionLabel: sBundle.getString(encInfoLabel),
    encryptionExplanation: sBundle.getString(encInfo),
  };

  let signatureKey = hdrView.msgSignatureKeyId;
  if (signatureKey) {
    let sigKeyInfo = win.EnigmailKeyRing.getKeyById(hdrView.msgSignatureKeyId);

    if (sigKeyInfo && sigKeyInfo.keyId != signatureKey) {
      signedDetails.signatureKeyIdLabel = await l10n.formatValue(
        "openpgp-sig-key-id-with-subkey-id",
        {
          key: `0x${sigKeyInfo.keyId}`,
          subkey: `0x${signatureKey}`,
        }
      );
      signedDetails.enableViewSignatureKey = true;
    } else {
      signedDetails.signatureKeyIdLabel = await l10n.formatValue(
        "openpgp-sig-key-id",
        {
          key: `0x${signatureKey}`,
        }
      );
    }
  }

  let myIdToSkipInList;
  let encryptionKeyId = hdrView.msgEncryptionKeyId?.keyId;
  if (encryptionKeyId) {
    myIdToSkipInList = encryptionKeyId;

    // If we were given a separate primaryKeyId, it means keyId is a subkey.
    let primaryId = hdrView.msgEncryptionKeyId.primaryKeyId;
    let havePrimaryId = !!primaryId;
    if (havePrimaryId) {
      encyptDetails.encryptionKeyIdLabel = await l10n.formatValue(
        "openpgp-enc-key-with-subkey-id",
        {
          key: `0x${primaryId}`,
          subkey: `0x${encryptionKeyId}`,
        }
      );
    } else {
      encyptDetails.encryptionKeyIdLabel = await l10n.formatValue(
        "openpgp-enc-key-id",
        {
          key: `0x${encryptionKeyId}`,
        }
      );
    }

    if (win.EnigmailKeyRing.getKeyById(encryptionKeyId)) {
      encyptDetails.enableViewEncryptionKey = true;
    }
  }

  if (myIdToSkipInList) {
    encyptDetails.otherKeysLabel = await l10n.formatValue(
      "openpgp-other-enc-all-key-ids"
    );
  } else {
    encyptDetails.otherKeysLabel = await l10n.formatValue(
      "openpgp-other-enc-additional-key-ids"
    );
  }

  if (!hdrView.msgEncryptionAllKeyIds) {
    return { signedDetails, encyptDetails };
  }

  encyptDetails.otherKeys = [];

  for (let key of hdrView.msgEncryptionAllKeyIds) {
    if (key.keyId == myIdToSkipInList) {
      continue;
    }

    let havePrimaryId2 = !!key.primaryKeyId;
    let keyInfo = win.EnigmailKeyRing.getKeyById(
      havePrimaryId2 ? key.primaryKeyId : key.keyId
    );

    let name;
    // Use textContent for label XUl elements to enable text wrapping.
    if (keyInfo) {
      name = keyInfo.userId;
    } else {
      name = await l10n.formatValue("openpgp-other-enc-all-key-ids");
    }

    let id = havePrimaryId2
      ? ` 0x${key.primaryKeyId} (0x${key.keyId})`
      : ` 0x${key.keyId}`;

    encyptDetails.otherKeys.push({ id, name });
  }

  return { signedDetails, encyptDetails };
}

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
