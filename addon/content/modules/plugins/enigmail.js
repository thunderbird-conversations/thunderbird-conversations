/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = [];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  getMail3Pane: "chrome://conversations/content/modules/misc.js",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  registerHook: "chrome://conversations/content/modules/hook.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
});

let Log = setupLogging("Conversations.Modules.Enigmail");

// Enigmail support, thanks to Patrick Brunschwig!

let hasEnigmail;

try {
  hasEnigmail = true;
  ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm");
} catch (ex) {
  hasEnigmail = false;
}

if (hasEnigmail) {
  XPCOMUtils.defineLazyModuleGetters(this, {
    EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
    EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
    EnigmailData: "chrome://openpgp/content/modules/data.jsm",
    EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
    EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
    EnigmailLocale: "chrome://openpgp/content/modules/locale.jsm",
  });
}

XPCOMUtils.defineLazyGetter(this, "browser", function () {
  return BrowserSim.getBrowser();
});

let enigmailSvc;
// eslint-disable-next-line no-redeclare
/* global window:true */
let window;

if (hasEnigmail) {
  window = getMail3Pane();
  enigmailSvc = EnigmailCore.getService(window);
  if (!enigmailSvc) {
    Log.debug("Error loading the Enigmail service. Is Enigmail disabled?\n");
    hasEnigmail = false;
  }

  // Override updateSecurityStatus in load event handler.
  let messagepane = getMail3Pane().document.getElementById("messagepane");
  messagepane.addEventListener(
    "load",
    function _overrideUpdateSecurity() {
      let w = getMail3Pane();
      if (w.Enigmail.hdrView) {
        overrideUpdateSecurity(messagepane, w);
      } else {
        w.addEventListener(
          "load-enigmail",
          () => {
            overrideUpdateSecurity(messagepane, w);
          },
          { once: true, capture: true }
        );
      }
    },
    { once: true, capture: true }
  );
}

// Override updateSecurityStatus for showing security info properly
// when plural messages in a thread are streamed at one time.
function overrideUpdateSecurity(messagepane, w) {
  // lastMsgWindow is needed to call updateSecurityStatus in mimeVerify.jsm.
  w.EnigmailVerify.lastMsgWindow = w.msgWindow;
  let headerSink = w.Enigmail.hdrView.headerPane;
  let originalUpdateSecurityStatus = headerSink.updateSecurityStatus;

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
      originalUpdateSecurityStatus.apply(this, arguments);
      return;
    }
    let message;
    let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    if (w.Conversations.currentConversation) {
      let uriSpec = msgHdrGetUri(msgHdr);
      message = w.Conversations.currentConversation.getMessage(uriSpec);
    }
    if (!message) {
      console.error("Message for the security info not found!");
      return;
    }
    if (message._updateHdrIcons) {
      // _updateHdrIcons is assigned if this is called before.
      // This function will be called twice a PGP/MIME encrypted message.
      return;
    }

    // Non-encrypted message may have decrypted labela since
    // message.isEncrypted is true for only signed pgp/mime message.
    // We reset decrypted label from decryption status.
    if (statusFlags & EnigmailConstants.DECRYPTION_OKAY) {
      addEncryptedTag(message);
    } else {
      removeEncryptedTag(message);
    }

    let encToDetails = "";
    if (extraDetails?.length) {
      let o = JSON.parse(extraDetails);
      if ("encryptedTo" in o) {
        encToDetails = o.encryptedTo;
      }
    }

    let updateHdrIcons = function () {
      w.Enigmail.hdrView.updateHdrIcons(
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
    };
    showHdrIconsOnStreamed(message, updateHdrIcons);

    // Show signed label of encrypted and signed pgp/mime.
    addSignedLabel(statusFlags, message);
  };

  let originalHandleSMimeMessage = headerSink.handleSMimeMessage;
  headerSink.handleSMimeMessage = function (uri) {
    // Use original if the classic reader is used.
    // Use original if the classic reader is used. If the contentDocument
    // does not exist, then the single view message pane hasn't been loaded
    // yet, so therefore the message must be loading in our window.
    if (
      messagepane.contentDocument &&
      messagepane.contentDocument.location.href !== "about:blank?"
    ) {
      originalHandleSMimeMessage.apply(this, arguments);
      return;
    }
    let message;
    let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
    let uriSpec = msgHdrGetUri(msgHdr);
    if (w.Conversations.currentConversation) {
      for (let x of w.Conversations.currentConversation.messages) {
        if (x.message._uri == uriSpec) {
          message = x.message;
          break;
        }
      }
    }
    if (!message) {
      console.error("Message for the SMIME info not found!");
      return;
    }
    w.EnigmailVerify.unregisterContentTypeHandler();
    message.setSmimeReload().catch(console.error);
  };
}

// eslint-disable-next-line complexity
function tryEnigmail(aDocument, aMessage, aMsgWindow) {
  let bodyElement = aDocument.body;
  let findStr = "-----BEGIN PGP";
  let msgText = null;
  let foundIndex = -1;
  if (bodyElement.firstChild) {
    let node = bodyElement.firstChild;
    while (node) {
      if (node.nodeName == "DIV") {
        foundIndex = node.textContent.indexOf(findStr);

        if (foundIndex >= 0) {
          if (
            node.textContent.indexOf(findStr + " LICENSE AUTHORIZATION") ==
            foundIndex
          ) {
            foundIndex = -1;
          }
        }
        if (foundIndex >= 0) {
          bodyElement = node;
          break;
        }
      }
      node = node.nextSibling;
    }
  }
  if (foundIndex < 0) {
    return null;
  }

  Log.debug("Found inline PGP");

  var signatureObj = {};
  var exitCodeObj = {};
  var statusFlagsObj = {};
  var keyIdObj = {};
  var userIdObj = {};
  var sigDetailsObj = {};
  var errorMsgObj = {};
  var encToDetailsObj = {};
  var blockSeparationObj = {
    value: "",
  };

  try {
    // extract text preceeding and/or following armored block
    // strip "- show quoted text -" from body text
    let NodeFilter = window.NodeFilter;
    let treeWalker = aDocument.createTreeWalker(
      bodyElement,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType == node.ELEMENT_NODE) {
            if (node.classList.contains("showhidequote")) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let text = [];
    while (treeWalker.nextNode()) {
      text.push(treeWalker.currentNode.nodeValue);
    }
    msgText = text.join("");
    msgText = msgText.replace(/\r\n?/g, "\n");

    var charset = aMsgWindow ? aMsgWindow.mailCharacterSet : "";
    Log.debug("charset=" + charset);

    // Encode ciphertext to charset from unicode
    msgText = EnigmailData.convertFromUnicode(msgText, charset);

    var mozPlainText = bodyElement.innerHTML.search(/class=\"moz-text-plain\"/);

    if (mozPlainText >= 0 && mozPlainText < 40) {
      // workaround for too much expanded emoticons in plaintext msg
      var r = new RegExp(
        /( )(;-\)|:-\)|;\)|:\)|:-\(|:\(|:-\\|:-P|:-D|:-\[|:-\*|\>:o|8-\)|:-\$|:-X|\=-O|:-\!|O:-\)|:\'\()( )/g
      );
      if (msgText.search(r) >= 0) {
        msgText = msgText.replace(r, "$2");
      }
    }

    let retry = charset != "UTF-8" ? 1 : 2;

    // extract text preceeding and/or following armored block
    var head = "";
    var tail = "";
    if (findStr) {
      head = msgText
        .substring(0, msgText.indexOf(findStr))
        .replace(/^[\n\r\s]*/, "");
      head = head.replace(/[\n\r\s]*$/, "");
      var endStart = msgText.indexOf("-----END PGP");
      var nextLine = msgText.substring(endStart).search(/[\n\r]/);
      if (nextLine > 0) {
        tail = msgText.substring(endStart + nextLine).replace(/^[\n\r\s]*/, "");
      }
    }
    if (msgText.indexOf("\nCharset:") > 0) {
      // Check if character set needs to be overridden
      var startOffset = msgText.indexOf("-----BEGIN PGP ");

      if (startOffset >= 0) {
        var subText = msgText.substr(startOffset);
        subText = subText.replace(/\r\n?/g, "\n");

        var endOffset = subText.search(/\n\n/);
        if (endOffset > 0) {
          subText = subText.substr(0, endOffset) + "\n";

          let matches = subText.match(/\nCharset: *(.*) *\n/i);
          if (matches?.length > 1) {
            // Override character set
            charset = matches[1];
            Log.debug("OVERRIDING charset=" + charset);
          }
        }
      }
    }

    var uiFlags = 0;

    var plainText = EnigmailDecryption.decryptMessage(
      window,
      uiFlags,
      msgText,
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    var exitCode = exitCodeObj.value;

    // do not return anything if gpg signales DECRYPTION_FAILED
    // (which could be possible in case of MDC errors)
    if (
      uiFlags & EnigmailConstants.UI_IGNORE_MDC_ERROR &&
      statusFlagsObj.value & EnigmailConstants.MISSING_MDC
    ) {
      Log.debug("enigmail.js: Enigmail.decryptMessage: ignoring MDC error");
    } else if (statusFlagsObj.value & EnigmailConstants.DECRYPTION_FAILED) {
      plainText = "";
    }

    if (plainText === "" && exitCode === 0) {
      plainText = " ";
    }
    if (!plainText) {
      return statusFlagsObj.value;
    }
    if (retry >= 2) {
      plainText = EnigmailData.convertFromUnicode(
        EnigmailData.convertToUnicode(plainText, "UTF-8"),
        charset
      );
    }
    if (blockSeparationObj.value?.includes(" ")) {
      let blocks = blockSeparationObj.value.split(/ /);
      let blockInfo = blocks[0].split(/:/);
      plainText =
        EnigmailData.convertFromUnicode(
          EnigmailLocale.getString("notePartEncrypted"),
          charset
        ) +
        "\n\n" +
        plainText.substr(0, blockInfo[1]) +
        "\n\n" +
        EnigmailLocale.getString("noteCutMessage");
    }

    var msgRfc822Text = "";
    if (head || tail) {
      if (head) {
        // print a warning if the signed or encrypted part doesn't start
        // quite early in the message
        let matches = head.match(/(\n)/g);
        if (matches && matches.length > 10) {
          msgRfc822Text =
            EnigmailData.convertFromUnicode(
              EnigmailLocale.getString("notePartEncrypted"),
              charset
            ) + "\n\n";
        }
        msgRfc822Text += head + "\n\n";
      }
      msgRfc822Text +=
        EnigmailData.convertFromUnicode(
          EnigmailLocale.getString("beginPgpPart"),
          charset
        ) + "\n\n";
    }
    msgRfc822Text += plainText;
    if (head || tail) {
      msgRfc822Text +=
        "\n\n" +
        EnigmailData.convertFromUnicode(
          EnigmailLocale.getString("endPgpPart"),
          charset
        ) +
        "\n\n" +
        tail;
    }

    if (exitCode == 0) {
      if (msgRfc822Text.length) {
        let node = bodyElement.querySelector("div.moz-text-plain");
        // If there's no suitable node to put the decrypted text in, create one
        // for ourselves... (happends with messages sent as html, duh).
        if (!node) {
          while (bodyElement.firstChild) {
            bodyElement.firstChild.remove();
          }
          let pre = bodyElement.ownerDocument.createElement("pre");
          bodyElement.appendChild(pre);
          node = pre;
        }
        msgRfc822Text = EnigmailData.convertToUnicode(msgRfc822Text, charset);
        // eslint-disable-next-line no-unsanitized/property
        node.innerHTML = EnigmailFuncs.formatPlaintextMsg(msgRfc822Text);
        aMessage.decryptedText = msgRfc822Text;
      }
    } else {
      Log.error(
        "Enigmail error: " + exitCode + " --- " + errorMsgObj.value + "\n"
      );
    }
    let w = topMail3Pane(aMessage);
    showHdrIconsOnStreamed(aMessage, function () {
      w.Enigmail.hdrView.updateHdrIcons(
        exitCode,
        statusFlagsObj.value,
        0,
        keyIdObj.value,
        userIdObj.value,
        sigDetailsObj.value,
        errorMsgObj.value,
        blockSeparationObj.value,
        encToDetailsObj.value
      );
    });
    return statusFlagsObj.value;
  } catch (ex) {
    console.error("Enigmail error:", errorMsgObj.value, ex);
    return null;
  }
}

// Verify PGP/MIME messages attachment signature.
function verifyAttachments(aMessage) {
  let {
    _attachments: attachments,
    _uri: uri,
    contentType: contentType,
  } = aMessage;
  let w = topMail3Pane(aMessage);
  if ((contentType + "").search(/^multipart\/signed(;|$)/i) == 0) {
    w.Enigmail.msg.messageDecryptCb(null, true, null);
    return;
  }
  if ((contentType + "").search(/^multipart\/mixed(;|$)/i) != 0) {
    return;
  }
  let embeddedSigned;
  for (let x of attachments) {
    if (x.contentType.search(/application\/pgp-signature/i) >= 0) {
      embeddedSigned = x.url.replace(/(\.\d+){1,2}&filename=.*$/, "");
      break;
    }
  }
  if (!embeddedSigned) {
    return;
  }
  let mailNewsUrl = w.Enigmail.msg.getCurrentMsgUrl();
  mailNewsUrl.spec = embeddedSigned;
  w.Enigmail.msg.verifyEmbeddedMsg(
    w,
    mailNewsUrl,
    w.msgWindow,
    uri,
    null,
    null
  );
}

// Update security info display of the message.
function updateSecurityInfo(aMessage) {
  let w = topMail3Pane(aMessage);
  w.Enigmail.hdrView.statusBarHide();
  if (aMessage._updateHdrIcons) {
    aMessage._updateHdrIcons();
  }
}

// Show security info only if the message is focused.
function showHdrIconsOnStreamed(message, updateHdrIcons) {
  let w = topMail3Pane(message);
  w.Enigmail.hdrView.statusBarHide();
  updateHdrIcons();
  // Prepare for showing on focus.
  message._updateHdrIcons = updateHdrIcons;
}

// Override treeController defined in enigmailMessengerOverlay.js
// not to hide status bar when multiple messages are selected.
// Remove unwanted event listeners.
function patchForShowSecurityInfo(aWindow) {
  let w = aWindow;
  if (w._newTreeController) {
    return;
  }

  let oldTreeController = w.top.controllers.getControllerForCommand(
    "button_enigmail_decrypt"
  );
  w.top.controllers.removeController(oldTreeController);
  let treeController = {};
  for (let [i, x] of Object.entries(oldTreeController)) {
    treeController[i] = x;
  }
  treeController.isCommandEnabled = function () {
    if (w.gFolderDisplay.messageDisplay.visible) {
      if (w.gFolderDisplay.selectedCount == 0) {
        w.Enigmail.hdrView.statusBarHide();
      }
      return w.gFolderDisplay.selectedCount == 1;
    }
    w.Enigmail.hdrView.statusBarHide();
    return false;
  };
  w.top.controllers.appendController(treeController);
  w._newTreeController = treeController;

  // Event listeners are added in enigmailMsgHdrViewOverlay.js,
  // but not needed. These display security info incorrectly when
  // resizing message view.
  w.removeEventListener(
    "messagepane-hide",
    w.Enigmail.hdrView.msgHdrViewHide,
    true
  );
  w.removeEventListener(
    "messagepane-unhide",
    w.Enigmail.hdrView.msgHdrViewUnide,
    true
  );
}

// Add signed label and click action to a signed message.
function addSignedLabel(status, msg) {
  if (
    status &
    (EnigmailConstants.BAD_SIGNATURE |
      EnigmailConstants.GOOD_SIGNATURE |
      EnigmailConstants.EXPIRED_KEY_SIGNATURE |
      EnigmailConstants.EXPIRED_SIGNATURE |
      EnigmailConstants.UNCERTAIN_SIGNATURE |
      EnigmailConstants.REVOKED_KEY |
      EnigmailConstants.EXPIRED_KEY_SIGNATURE |
      EnigmailConstants.EXPIRED_SIGNATURE)
  ) {
    msg.addSpecialTag({
      canClick: true,
      classNames: "enigmail-signed",
      icon: "material-icons.svg#edit",
      name: browser.i18n.getMessage("enigmail.messageSigned"),
      details: {
        type: "enigmail",
        detail: "viewSecurityInfo",
      },
      title:
        status & EnigmailConstants.UNVERIFIED_SIGNATURE
          ? browser.i18n.getMessage("enigmail.unknownGood")
          : browser.i18n.getMessage("enigmail.messageSignedLong"),
    });
  }
}

function addEncryptedTag(msg) {
  msg.addSpecialTag({
    canClick: true,
    classNames: "enigmail-decrypted",
    icon: "material-icons.svg#vpn_key",
    name: browser.i18n.getMessage("enigmail.messageDecrypted"),
    details: {
      type: "enigmail",
      detail: "viewSecurityInfo",
    },
    title: browser.i18n.getMessage("enigmail.messageDecryptedLong"),
  });
}

function removeEncryptedTag(msg) {
  msg.removeSpecialTag({
    classNames: "enigmail-decrypted",
    name: browser.i18n.getMessage("enigmail.messageDecrypted"),
  });
}

let enigmailHook = {
  _domNode: null,
  _originalText: null, // for restoring original text when sending message is canceled
  _currentlyStreaming: [],
  _oldIsCurrentMsgFn: null,
  _oldGetCurrentMsgUriSpecFn: null,

  onMessageBeforeStreaming(msg) {
    if (!enigmailSvc) {
      return;
    }
    let w = topMail3Pane(msg);
    if (!this._oldIsCurrentMsgFn) {
      this._oldIsCurrentMsgFn = w.Enigmail.hdrView.headerPane.isCurrentMessage;
    }
    if (!this._oldGetCurrentMsgUriSpecFn) {
      this._oldGetCurrentMsgUriSpecFn = w.Enigmail.msg.getCurrentMsgUriSpec;
    }

    // Enigmail needs to know that the message we're currently streaming is the
    // 'current' message.
    this._oldIsCurrentMsgUriSpecFn = w.Enigmail.msg.getCurrentMsgUriSpec;
    this._currentlyStreaming.push(msg._uri);
    w.Enigmail.hdrView.headerPane.isCurrentMessage = (uri) => {
      if (this._currentlyStreaming.includes(uri)) {
        w.Enigmail.msg.getCurrentMsgUriSpec = function () {
          return uri;
        };
      }
      return this._oldIsCurrentMsgFn(uri);
    };

    verifyAttachments(msg);
    patchForShowSecurityInfo(w);
  },

  onMessageStreamed(msgHdr, iframe, mainWindow, message) {
    let iframeDoc = iframe.contentDocument;
    if (iframeDoc.body.textContent.length && hasEnigmail) {
      let status = tryEnigmail(iframeDoc, message, mainWindow.msgWindow);
      if (status & EnigmailConstants.DECRYPTION_OKAY) {
        addEncryptedTag(message);
      }
      addSignedLabel(status, message);
    }
    this._currentlyStreaming = this._currentlyStreaming.filter(
      (uri) => uri == message._uri
    );
    if (!this._currentlyStreaming.length) {
      if (this._oldIsCurrentMsgFn) {
        mainWindow.Enigmail.hdrView.headerPane.isCurrentMessage =
          this._oldIsCurrentMsgFn;
      }
      if (this._oldGetCurrentMsgUriSpecFn) {
        mainWindow.Enigmail.msg.getCurrentMsgUriSpec =
          this._oldGetCurrentMsgUriSpecFn;
      }
      this._oldIsCurrentMsgFn = null;
      this._oldGetCurrentMsgUriSpecFn = null;
    }
  },

  onMessageTagClick(win, event, extraData) {
    if (extraData.type != "enigmail") {
      return;
    }

    if (extraData.detail == "viewSecurityInfo") {
      win.showMessageReadSecurityInfo();
    }
  },

  // Update security info when the message is selected.
  onMessageSelected(aMessage) {
    if (hasEnigmail) {
      updateSecurityInfo(aMessage);
    }
  },
};

registerHook("enigmail", enigmailHook);
