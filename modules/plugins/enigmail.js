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
 *      Components.utils.import("resource://conversations/hook.js");
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
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/misc.js");
Cu.import("resource://conversations/hook.js");
Cu.import("resource://conversations/log.js");

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
window.addEventListener("load", function () {
  if (hasEnigmail) {
    enigmailSvc = EnigmailCommon.getService(window);
    if (!enigmailSvc) {
      Log.debug("Error loading the Enigmail service. Is Enigmail disabled?\n");
      hasEnigmail = false;
    }
  }
}, false);

function tryEnigmail(bodyElement, aMsgWindow) {
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
    head = msgText.substring(0, startOffset).replace(/^[\n\r\s]*/,"");
    head = head.replace(/[\n\r\s]*$/,"");
    var endStart = msgText.indexOf("-----END PGP");
    var nextLine = msgText.substring(endStart).search(/[\n\r]/);
    if (nextLine > 0) {
      tail = msgText.substring(endStart+nextLine).replace(/^[\n\r\s]*/,"");
    }

    var decryptedText =
      enigmailSvc.decryptMessage(window, 0, bodyElement.textContent,
        signatureObj, exitCodeObj,
        statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj,
        errorMsgObj, blockSeparationObj);

    var charset = aMsgWindow ? aMsgWindow.mailCharacterSet : "";
    var subText = msgText.substr(startOffset);
    var matches = subText.match(/\n[> ]*Charset: *(.*) *\n/i);
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
      msgRfc822Text += "\n\n"+ EnigmailCommon.getString("endPgpPart")+"\n\n"+tail;
    }

    if (exitCodeObj.value == 0) {
      if (msgRfc822Text.length > 0) {
        bodyElement.innerHTML = "<div class='moz-text-plain'>"+EnigmailFuncs.formatPlaintextMsg(msgRfc822Text)+"</div>";
        bodyElement.style.whiteSpace = "pre-wrap";
        let elements = bodyElement.getElementsByClassName("moz-txt-citetags");
        for (let i = elements.length - 1; i >= 0; i--) {
          let e = elements[i];
          if (e)
            e.parentNode.removeChild(e);
        }
      }
      return statusFlagsObj.value;
    }
  } catch (ex) {
    dumpCallStack(ex);
    Log.error("Enigmail error: "+ex+" --- "+errorMsgObj.value+"\n");
    return null;
  }
}

let enigmailHook = {
  _domNode: null,

  onMessageBeforeStreaming: function _enigmailHook_onBeforeStreaming(aMessage) {
    if (enigmailSvc) {
      let { _attachments: attachments, _msgHdr: msgHdr, _domNode: domNode } = aMessage;
      this._domNode = domNode;
      let w = topMail3Pane(aMessage);
      let hasEnc = (aMessage.contentType+"").search(/^multipart\/encrypted(;|$)/i) == 0;
      if (hasEnc && !enigmailSvc.mimeInitialized()) {
        Log.debug("Initializing EnigMime");
        w.document.getElementById("messagepane").setAttribute("src", "enigmail:dummy");
      }

      let hasSig = (aMessage.contentType+"").search(/^multipart\/signed(;|$)/i) == 0;
      if (hasSig)
        aMessage._domNode.classList.add("signed");
    }
  },

  onMessageStreamed: function _enigmailHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow) {
    let iframe = aDomNode.getElementsByTagName("iframe")[0];
    let iframeDoc = iframe.contentDocument;
    if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
      let status = tryEnigmail(iframeDoc.body, aMsgWindow);
      if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
        aDomNode.classList.add("decrypted");
      if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
        aDomNode.classList.add("signed");
      if (status & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE) {
        aDomNode.classList.add("signed");
        aDomNode.getElementsByClassName("tag-signed")[0]
          .setAttribute("title", strings.get("unknownGood"));
      }
    }
  },
}

registerHook(enigmailHook);
