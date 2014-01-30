/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Patrick Brunschwig <patrick@enigmail.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = [];

/*
 * A typical "Thunderbird conversations" plugin would be as follows:
 *
 * - An overlay.xul that overlays whatever is loaded at startup (say,
 *   messenger.xul), with a <script> in it that reads
 *
 *    Components.utils.import("resource://yourext/conv-plugin.js");
 *
 * - The main work will happen in conv-plugin.js. For instance:
 *
 *    var EXPORTED_SYMBOLS = [];
 *
 *    let hasConversations;
 *    try {
 *      Components.utils.import("resource://conversations/modules/hook.js");
 *      hasConversations = true;
 *    } catch (e) {
 *      hasConversations = false;
 *    }
 *    if (hasConversations)
 *      registerHook({
 *        // your functions here
 *      });
 *
 * That way, your conv-plugin.js won't export anything and AMO won't bother you.
 */

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/Services.jsm"); // https://developer.mozilla.org/en/JavaScript_code_modules/Services.jsm
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/modules/stdlib/misc.js");
Cu.import("resource://conversations/modules/stdlib/compose.js");
Cu.import("resource://conversations/modules/misc.js");
Cu.import("resource://conversations/modules/hook.js");
Cu.import("resource://conversations/modules/log.js");

let strings = new StringBundle("chrome://conversations/locale/message.properties");

let Log = setupLogging("Conversations.Modules.Enigmail");

// This is an example of a "Thunderbird Conversations" plugin. This is how one
//  is expected to interact with the plugin. As an example, we add an extra
//  Enigmail compatibility layer to make sure we use Enigmail to decrypt
//  messages whenever possible.
// If you need to listen to more events (conversation loaded, conversation
//  wiped)... just ask!

// Enigmail support, thanks to Patrick Brunschwig!
let window = getMail3Pane();
let hasEnigmail;
try {
  Cu.import("resource://enigmail/enigmailCommon.jsm");
  Cu.import("resource://enigmail/commonFuncs.jsm");
  hasEnigmail = true;
  Log.debug("Enigmail plugin for Thunderbird Conversations loaded!");
} catch (e) {
  hasEnigmail = false;
  Log.debug("Enigmail doesn't seem to be installed...");
}

let enigmailSvc;
let gMsgCompose = null; // used in enigmailMsgComposeOverlay.js
let global = this;
if (hasEnigmail) {
  enigmailSvc = EnigmailCommon.getService(window);
  if (!enigmailSvc) {
    Log.debug("Error loading the Enigmail service. Is Enigmail disabled?\n");
    hasEnigmail = false;
  }
  try {
    let loader = Services.scriptloader;
    loader.loadSubScript("chrome://enigmail/content/enigmailMsgComposeOverlay.js", global);
    loader.loadSubScript("chrome://enigmail/content/enigmailMsgComposeHelper.js", global);
  } catch (e) {
    hasEnigmail = false;
    Log.debug("Enigmail script doesn't seem to be loaded. Error: " + e);
  }

  let w = getMail3Pane();
  let iframe = w.document.createElement("iframe");
  iframe.addEventListener("load", function () {
    iframe.parentNode.removeChild(iframe);
  }, true);
  iframe.setAttribute("src", "enigmail:dummy");
  iframe.style.display = "none";
  w.document.getElementById("messagepane").appendChild(iframe);

  // Override updateSecurityStatus for showing security info properly
  // when plural messages in a thread are streamed at one time.
  let messagepane = w.document.getElementById("messagepane");
  messagepane.addEventListener("load", function _overrideUpdateSecurity() {
    messagepane.removeEventListener("load", _overrideUpdateSecurity, true);
    let w = getMail3Pane();
    w._encryptedMimeMessages = [];
    w.messageHeaderSink.enigmailPrepSecurityInfo();

    // EnigMimeHeaderSink.prototype in enigmailMsgHdrViewOverlay.js
    let enigMimeHeaderSinkPrototype =
      Object.getPrototypeOf(w.messageHeaderSink.securityInfo);
    enigMimeHeaderSinkPrototype
      .updateSecurityStatus = function _updateSecurityStatus_patched(uriSpec) {
      let message;
      // multipart/encrypted message doesn't have uriSpec.
      if (!uriSpec) {
        // possible to get a wrong message
        message = w._encryptedMimeMessages.shift();
      }
      // Use a nsIURI object to identify the message correctly.
      // Enigmail <= 1.3.3 doesn't support uri argument.
      let uri = arguments[8];
      if (uri) {
        let msgHdr = uri.QueryInterface(Ci.nsIMsgMessageUrl).messageHeader;
        uriSpec = msgHdrGetUri(msgHdr);
      }
      if (uriSpec && w._currentConversation) {
        for each (let [, x] in Iterator(w._currentConversation.messages)) {
          if (x.message._uri == uriSpec) {
            message = x.message;
            break;
          }
        }
      }
      let args = Array.prototype.slice.call(arguments, 1);
      let updateHdrIcons = function () {
        w.Enigmail.hdrView.updateHdrIcons.apply(w.Enigmail.hdrView, args);
      };
      if (!message) {
        Log.error("Message for the security info not found!\n");
        updateHdrIcons();
        return;
      }
      showHdrIconsOnStreamed(message, updateHdrIcons);

      // Show signed label of encrypted and signed pgp/mime.
      let statusFlags = arguments[2];
      addSignedLabel(statusFlags, message._domNode, message);
    }
  }, true);
}

function tryEnigmail(bodyElement, aMessage) {
  if (bodyElement.textContent.indexOf("-----BEGIN PGP") < 0)
    return null;

  Log.debug("Found inline PGP");

  var signatureObj       = new Object();
  var exitCodeObj        = new Object();
  var statusFlagsObj     = new Object();
  var keyIdObj           = new Object();
  var userIdObj          = new Object();
  var sigDetailsObj      = new Object();
  var errorMsgObj        = new Object();
  var blockSeparationObj = new Object();

  try {
    // extract text preceeding and/or following armored block
    var head = "";
    var tail = "";
    var msgText = bodyElement.textContent;
    var startOffset = msgText.indexOf("-----BEGIN PGP");
    var indentMatches = msgText.match(/\n(.*)-----BEGIN PGP/);
    var indent = "";
    if (indentMatches && (indentMatches.length > 1)) {
      indent = indentMatches[1];
    }
    head = msgText.substring(0, startOffset).replace(/^[\n\r\s]*/,"");
    head = head.replace(/[\n\r\s]*$/,"");
    var endStart = msgText.indexOf("\n"+indent+"-----END PGP") + 1;
    var nextLine = msgText.substring(endStart).search(/[\n\r]/);
    if (nextLine > 0) {
      tail = msgText.substring(endStart+nextLine).replace(/^[\n\r\s]*/,"");
    }

    var pgpBlock = msgText.substring(startOffset - indent.length,
                                     endStart + nextLine);
    if (nextLine == 0) {
      pgpBlock += msgText.substring(endStart);
    }
    if (indent) {
      pgpBlock = pgpBlock.replace(new RegExp("^"+indent+"?", "gm"), "");
    }
    var charset = aMessage._msgHdr.Charset;
    msgText = EnigmailCommon.convertFromUnicode(
                head+"\n"+pgpBlock+"\n"+tail, charset);

    var decryptedText =
      enigmailSvc.decryptMessage(window, 0, msgText,
        signatureObj, exitCodeObj,
        statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj,
        errorMsgObj, blockSeparationObj);

    var matches = pgpBlock.match(/\nCharset: *(.*) *\n/i);
    if (matches && (matches.length > 1)) {
      // Override character set
      charset = matches[1];
    }

    var msgRfc822Text = "";
    if (head || tail) {
      if (head) {
        // print a warning if the signed or encrypted part doesn't start
        // quite early in the message
        matches = head.match(/(\n)/g);
        if (matches && matches.length > 10) {
          msgRfc822Text = EnigmailCommon.getString("notePartEncrypted")+"\n\n";
        }
        msgRfc822Text += head+"\n\n";
      }
      msgRfc822Text += EnigmailCommon.getString("beginPgpPart")+"\n\n";
    }
    msgRfc822Text += EnigmailCommon.convertToUnicode(decryptedText, charset);
    if (head || tail) {
      msgRfc822Text += "\n\n"+EnigmailCommon.getString("endPgpPart")+"\n\n"+tail;
    }

    if (exitCodeObj.value == 0) {
      if (msgRfc822Text.length > 0) {
        let node = bodyElement.querySelector("div.moz-text-plain");
        // If there's no suitable node to put the decrypted text in, create one
        // for ourselves... (happends with messages sent as html, duh).
        if (!node) {
          while (bodyElement.firstChild)
            bodyElement.removeChild(bodyElement.firstChild);
          let pre = bodyElement.ownerDocument.createElement("pre");
          bodyElement.appendChild(pre);
          node = pre;
        }
        node.innerHTML = EnigmailFuncs.formatPlaintextMsg(msgRfc822Text);
        aMessage.decryptedText = msgRfc822Text;
      }
    } else {
      Log.error("Enigmail error: "+exitCodeObj.value+" --- "+errorMsgObj.value+"\n");
    }
    let w = topMail3Pane(aMessage);
    showHdrIconsOnStreamed(aMessage, function () {
      w.Enigmail.hdrView.updateHdrIcons(exitCodeObj.value, statusFlagsObj.value,
        keyIdObj.value, userIdObj.value, sigDetailsObj.value, errorMsgObj.value,
        blockSeparationObj.value);
    });
    return statusFlagsObj.value;
  } catch (ex) {
    dumpCallStack(ex);
    Log.error("Enigmail error: "+ex+" --- "+errorMsgObj.value+"\n");
    return null;
  }
}

// Verify PGP/MIME messages attachment signature.
function verifyAttachments(aMessage) {
  let { _attachments: attachments, _uri: uri, contentType: contentType } = aMessage;
  let w = topMail3Pane(aMessage);
  w.Enigmail.msg.getCurrentMsgUriSpec = function () uri;
  if ((contentType+"").search(/^multipart\/signed(;|$)/i) == 0) {
    w.Enigmail.msg.messageDecryptCb(null, true, {
      headers: {'content-type': contentType },
      contentType: contentType,
      parts: null,
    });
    return;
  }
  if ((contentType+"").search(/^multipart\/mixed(;|$)/i) != 0)
    return;
  let embeddedSigned;
  for each (let [, x] in Iterator(attachments)) {
    if (x.contentType.search(/application\/pgp-signature/i) >= 0) {
      embeddedSigned = x.url.replace(/(\.\d+){1,2}&filename=.*$/, "");
      break;
    }
  }
  if (!embeddedSigned)
    return;
  let mailNewsUrl = w.Enigmail.msg.getCurrentMsgUrl();
  mailNewsUrl.spec = embeddedSigned;
  w.Enigmail.msg.verifyEmbeddedMsg(w, mailNewsUrl, w.msgWindow, uri,
    null, null);
}

// Prepare for showing security info later
function prepareForShowHdrIcons(aMessage, aHasEnc) {
  let w = topMail3Pane(aMessage);
  let conversation = aMessage._conversation;

  // w.Conversations.currentConversation is assined when conversation
  // _onComplete(), but we need currentConversation in
  // updateSecurityStatus() which is possible to be called before
  // _onComplete().
  w._currentConversation = conversation;

  if (aHasEnc)
    w._encryptedMimeMessages.push(aMessage);
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
function showHdrIconsOnStreamed(aMessage, updateHdrIcons) {
  let w = topMail3Pane(aMessage);
  let { _domNode: node, _conversation: conversation } = aMessage;
  let focused = (node == node.ownerDocument.activeElement);
  if (!focused) {
    let focusThis = conversation._tellMeWhoToScroll();
    focused = (aMessage == conversation.messages[focusThis].message);
  }
  if (focused)
    updateHdrIcons();

  // Prepare for showing on focus.
  aMessage._updateHdrIcons = updateHdrIcons;
}

// Override treeController defined in enigmailMessengerOverlay.js
// not to hide status bar when multiple messages are selected.
// Remove unwanted event listeners.
function patchForShowSecurityInfo(aWindow) {
  let w = aWindow;
  if (w._newTreeController)
    return;

  let oldTreeController =
    w.top.controllers.getControllerForCommand("button_enigmail_decrypt");
  w.top.controllers.removeController(oldTreeController);
  let treeController = {};
  [treeController[i] = x for each ([i, x] in Iterator(oldTreeController))];
  treeController.isCommandEnabled = function () {
    if (w.gFolderDisplay.messageDisplay.visible) {
      if (w.gFolderDisplay.selectedCount == 0) {
        w.Enigmail.hdrView.statusBarHide();
      }
      return (w.gFolderDisplay.selectedCount == 1);
    }
    w.Enigmail.hdrView.statusBarHide();
  };
  w.top.controllers.appendController(treeController);
  w._newTreeController = treeController;

  // Event listeners are added in enigmailMsgHdrViewOverlay.js,
  // but not needed. These display security info incorrectly when
  // resizing message view.
  w.removeEventListener('messagepane-hide', w.Enigmail.hdrView.msgHdrViewHide, true);
  w.removeEventListener('messagepane-unhide', w.Enigmail.hdrView.msgHdrViewUnide, true);
}

// Add signed label and click action to a signed message.
function addSignedLabel(aStatus, aDomNode, aMessage) {
  if (aStatus & (Ci.nsIEnigmail.BAD_SIGNATURE |
      Ci.nsIEnigmail.GOOD_SIGNATURE |
      Ci.nsIEnigmail.EXPIRED_KEY_SIGNATURE |
      Ci.nsIEnigmail.EXPIRED_SIGNATURE |
      Ci.nsIEnigmail.UNVERIFIED_SIGNATURE |
      Ci.nsIEnigmail.REVOKED_KEY |
      Ci.nsIEnigmail.EXPIRED_KEY_SIGNATURE |
      Ci.nsIEnigmail.EXPIRED_SIGNATURE)) {
    aDomNode.classList.add("signed");
    let w = getMail3Pane();
    let signedTag = aDomNode.querySelector(".keep-tag.tag-signed");
    if (aMessage._viewSecurityInfo)
      signedTag.removeEventListener("click", aMessage._viewSecurityInfo, false);
    aMessage._viewSecurityInfo = function (event) {
      // Open alert dialog which contains security info.
      w.Enigmail.msg.viewSecurityInfo(event);
    };
    signedTag.addEventListener("click", aMessage._viewSecurityInfo, false);
    signedTag.style.cursor = "pointer";
  }
  if (aStatus & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE) {
    [x.setAttribute("title", strings.get("unknownGood"))
      for each ([, x] in Iterator(aDomNode.querySelectorAll(".tag-signed")))];
  }
}

let enigmailHook = {
  _domNode: null,
  _originalText: null, // for restoring original text when sending message is canceled

  onMessageBeforeStreaming: function _enigmailHook_onBeforeStreaming(aMessage) {
    if (enigmailSvc) {
      let { _attachments: attachments, _msgHdr: msgHdr, _domNode: domNode } = aMessage;
      this._domNode = domNode;
      let w = topMail3Pane(aMessage);
      let hasEnc = (aMessage.contentType+"").search(/^multipart\/encrypted(;|$)/i) == 0;
      if (hasEnc && enigmailSvc.mimeInitialized && !enigmailSvc.mimeInitialized()) {
        Log.debug("Initializing EnigMime");
        w.document.getElementById("messagepane").setAttribute("src", "enigmail:dummy");
      }

      let hasSig = (aMessage.contentType+"").search(/^multipart\/signed(;|$)/i) == 0;
      for each (let [, x] in Iterator(attachments)) {
        if (x.contentType.search(/^application\/pgp-signature/i) == 0)
          hasSig = true;
      }
      if (hasSig)
        aMessage._domNode.classList.add("signed");

      verifyAttachments(aMessage);
      prepareForShowHdrIcons(aMessage, hasEnc);
      patchForShowSecurityInfo(w);
    }
  },

  onMessageStreamed: function _enigmailHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow, aMessage) {
    let iframe = aDomNode.getElementsByTagName("iframe")[0];
    let iframeDoc = iframe.contentDocument;
    if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
      let status = tryEnigmail(iframeDoc.body, aMessage);
      if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
        aDomNode.classList.add("decrypted");
      addSignedLabel(status, aDomNode, aMessage);
    }
  },

  onMessageBeforeSendOrPopout: function _enigmailHook_onMessageBeforeSendOrPopout(aAddress, aEditor, aStatus, aPopout, aAttachmentList) {
    if (hasEnigmail)
      this._originalText = null;

    if (!hasEnigmail || aPopout || aStatus.canceled)
      return aStatus;

    // global window is used in Enigmail function
    window = getMail3Pane();

    const nsIEnigmail = Ci.nsIEnigmail;
    const SIGN = nsIEnigmail.SEND_SIGNED;
    const ENCRYPT = nsIEnigmail.SEND_ENCRYPTED;

    let uiFlags = nsIEnigmail.UI_INTERACTIVE;

    let identity = aAddress.params.identity
    Enigmail.msg.identity = identity;
    Enigmail.msg.enableRules = true;
    Enigmail.msg.sendModeDirty = 0;

    let fromAddr = identity.email;
    let userIdValue;
    // Enigmail <= 1.3.2 doesn't support getSenderUserId.
    if (Enigmail.msg.getSenderUserId) {
      userIdValue = Enigmail.msg.getSenderUserId();
    } else if (identity.getIntAttribute("pgpKeyMode") > 0) {
      userIdValue = identity.getCharAttribute("pgpkeyId");
    }
    if (userIdValue)
      fromAddr = userIdValue;

    Enigmail.msg.setSendDefaultOptions();
    let sendFlags = Enigmail.msg.sendMode;
    if (Enigmail.msg.sendPgpMime) {
      // Use PGP/MIME
      sendFlags |= nsIEnigmail.SEND_PGP_MIME;
    }

    let optSendFlags = 0;
    if (EnigmailCommon.getPref("alwaysTrustSend")) {
      optSendFlags |= nsIEnigmail.SEND_ALWAYS_TRUST;
    }
    if (EnigmailCommon.getPref("encryptToSelf") ||
        (sendFlags & nsIEnigmail.SAVE_MESSAGE)) {
      optSendFlags |= nsIEnigmail.SEND_ENCRYPT_TO_SELF;
    }
    let gotSendFlags = sendFlags;
    sendFlags |= optSendFlags;

    let toAddrList = aAddress.to.concat(aAddress.cc)
      .map(EnigmailFuncs.stripEmail);
    let bccAddrList = aAddress.bcc.map(EnigmailFuncs.stripEmail);

    let toAddr = toAddrList.join(", ");
    let bccAddr = bccAddrList.join(", ");
    // Enigmail <= 1.3.2 doesn't support keySelection.
    if (Enigmail.msg.keySelection) {
      let result = Enigmail.msg.keySelection(
                     enigmailSvc, sendFlags, optSendFlags, gotSendFlags,
                     fromAddr, toAddrList, bccAddrList);
      if (!result) {
        aStatus.canceled = true;
        return aStatus;
      } else {
        sendFlags = result.sendFlags;
        toAddr = result.toAddr;
        bccAddr = result.bccAddr;
      }
    }

    let statusFlagsObj = {};
    let exitCodeObj = {};
    let errorMsgObj = {};

    try {
      let origText;
      let usingPGPMime = (sendFlags & nsIEnigmail.SEND_PGP_MIME) &&
                         (sendFlags & (ENCRYPT | SIGN));

      if (!usingPGPMime && (sendFlags & ENCRYPT) &&
          aAttachmentList && aAttachmentList.attachments.length > 0) {
        // Attachments will not be encrypted using inline-PGP.
        // We switch to PGP/MIME if possible.
        if (EnigmailCommon.confirmDlg(window,
            strings.get("attachmentsNotEncrypted"),
            EnigmailCommon.getString("pgpMime_sMime.dlg.pgpMime.button"),
            EnigmailCommon.getString("dlg.button.cancel"))) {
          usingPGPMime = true;
          sendFlags |= nsIEnigmail.SEND_PGP_MIME;
        } else {
          aStatus.canceled = true;
          return aStatus;
        }
      }

      if (usingPGPMime) {
        uiFlags |= nsIEnigmail.UI_PGP_MIME;

        let newSecurityInfo = Cc[Enigmail.msg.compFieldsEnig_CID]
          .createInstance(Ci.nsIEnigMsgCompFields);
        newSecurityInfo.sendFlags = sendFlags;
        newSecurityInfo.UIFlags = uiFlags;
        newSecurityInfo.senderEmailAddr = fromAddr;
        newSecurityInfo.recipients = toAddr;
        newSecurityInfo.bccRecipients = bccAddr;
        if (Enigmail.msg.mimeHashAlgo) {
          // Enigmail < 1.5.1
          // hashAlgorithm was removed since Enigmail 1.5.1
          newSecurityInfo.hashAlgorithm =
            Enigmail.msg.mimeHashAlgo[EnigmailCommon.getPref("mimeHashAlgorithm")];
        }
        aStatus.securityInfo = newSecurityInfo;

      } else if (sendFlags & (ENCRYPT | SIGN)) {
        // inline-PGP
        let plainText = aEditor.value;
        let charset = "UTF-8";
        origText = plainText;
        if (!(sendFlags & ENCRYPT)) {
          // Clear signing replaces preceding '-' to '- -'.
          // It produces 2 characters longer lines.
          // To prevent rewrap breaking validity of sign,
          // prepare for the case: over 70 char's long lines starting with '-'
          let width = 72;
          if (plainText.match(/^-.{70,}/m)) {
            width -= 2;
          }
          plainText = simpleWrap(plainText, width);
        }
        plainText = EnigmailCommon.convertFromUnicode(plainText, charset);
        let cipherText;
        if (Enigmail.msg.mimeHashAlgo) {
          // Enigmail < 1.5.1
          cipherText = enigmailSvc.encryptMessage(window, uiFlags, null,
                         plainText, fromAddr, toAddr, bccAddr,
                         sendFlags, exitCodeObj, statusFlagsObj, errorMsgObj);
        } else {
          // Third argument(hashAlgorithm) was removed since Enigmail 1.5.1
          cipherText = enigmailSvc.encryptMessage(window, uiFlags,
                         plainText, fromAddr, toAddr, bccAddr,
                         sendFlags, exitCodeObj, statusFlagsObj, errorMsgObj);
        }

        let exitCode = exitCodeObj.value;
        if (cipherText && (exitCode == 0)) {
          if ((sendFlags & ENCRYPT) && charset &&
            (charset.search(/^us-ascii$/i) != 0) ) {
            // Add Charset armor header for encrypted blocks
            cipherText = cipherText.replace(/(-----BEGIN PGP MESSAGE----- *)(\r?\n)/,
              "$1$2Charset: "+charset+"$2");
          }
          cipherText = EnigmailCommon.convertToUnicode(cipherText, charset);
          aEditor.value = cipherText;
          this._originalText = origText;
        } else {
          // Encryption/signing failed
          let msg = EnigmailCommon.getString("signFailed") + "\n"
                  + errorMsgObj.value;
          aStatus.canceled = !EnigmailCommon.confirmDlg(window, msg,
            EnigmailCommon.getString("msgCompose.button.sendUnencrypted"));
          return aStatus;
        }
      }

      if ((!(sendFlags & nsIEnigmail.SAVE_MESSAGE)) &&
           EnigmailCommon.getPref("confirmBeforeSend")) {
        if (!Enigmail.msg.confirmBeforeSend(toAddrList.join(", "), toAddr+", "+bccAddr,
             sendFlags, false)) {
          if (origText) {
            aEditor.value = origText;
          }
          aStatus.canceled = true;
          return aStatus;
        }
      }
    } catch (ex) {
      dumpCallStack(ex);
      Log.error("Enigmail encrypt error: "+ex+" --- "+errorMsgObj.value+"\n");
      let msg = EnigmailCommon.getString("signFailed");
      if (EnigmailCommon.enigmailSvc && EnigmailCommon.enigmailSvc.initializationError) {
        msg += "\n"+EnigmailCommon.enigmailSvc.initializationError;
      }
      aStatus.canceled = !EnigmailCommon.confirmDlg(window, msg,
        EnigmailCommon.getString("msgCompose.button.sendUnencrypted"));
    }
    return aStatus;
  },

  onMessageBeforeSendOrPopout_canceled: function _enigmailHook_onMessageBeforeSendOrPopout_canceled(aAddress, aEditor, aStatus, aPopout, aAttachmentList) {
    if (hasEnigmail && !aPopout && aStatus.canceled && this._originalText !== null) {
       aEditor.value = this._originalText;
    }
  },

  onReplyComposed: function _enigmailHook_onReplyComposed(aMessage, aBody) {
    if (hasEnigmail && aMessage.decryptedText) {
      return citeString("\n" + aMessage.decryptedText);
    }
    return aBody;
  },

  // Update security info when the message is selected.
  onMessageSelected: function _enigmailHook_onMessageSelected(aMessage) {
    if (hasEnigmail) {
      // EnigmailVerify is supported since Enigmail 1.4.6
      // lastMsgUri is used for security info display to get current message.
      let w = topMail3Pane(aMessage);
      if (w.EnigmailVerify)
        w.EnigmailVerify.lastMsgUri = aMessage._uri;
      updateSecurityInfo(aMessage);
    }
  },
}

registerHook(enigmailHook);
