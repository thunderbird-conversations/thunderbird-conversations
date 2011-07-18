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

Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/stdlib/misc.js");
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

function tryEnigmail(bodyElement) {
  if (bodyElement.textContent.indexOf("-----BEGIN PGP") < 0)
    return null;

  var signatureObj       = new Object();
  var exitCodeObj        = new Object();
  var statusFlagsObj     = new Object();
  var keyIdObj           = new Object();
  var userIdObj          = new Object();
  var sigDetailsObj      = new Object();
  var errorMsgObj        = new Object();
  var blockSeparationObj = new Object();

  try {
    var decryptedText =
      enigmailSvc.decryptMessage(window, 0, bodyElement.textContent,
        signatureObj, exitCodeObj,
        statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj,
        errorMsgObj, blockSeparationObj);
    var charset = null;
    var matches = bodyElement.textContent.match(/\nCharset: *(.*) *\n/i);
    if (matches && (matches.length > 1)) {
      // Override character set
      charset = matches[1];
    }
    decryptedText = EnigmailCommon.convertToUnicode(decryptedText, charset);
    if (exitCodeObj.value == 0) {
      if (decryptedText.length > 0) {
        bodyElement.innerHTML = "<div class='moz-text-plain'></div>";
        bodyElement.firstElementChild.textContent = decryptedText;
        bodyElement.style.whiteSpace = "pre-wrap";
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
  onMessageStreamed: function _enigmailHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow) {
    let iframe = aDomNode.getElementsByTagName("iframe")[0];
    let iframeDoc = iframe.contentDocument;
    let specialTags = aDomNode.getElementsByClassName("special-tags")[1];
    if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
      let status = tryEnigmail(iframeDoc.body);
      let addTag = function _addTag(url, txt) {
        let li = iframe.ownerDocument.createElement("li");
        li.innerHTML = ["<img src=\"", url, "\" />", txt].join("");
        specialTags.appendChild(li);
      };
      if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
        addTag("chrome://conversations/content/i/enc.png", strings.get("encrypted"));
      if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
        addTag("chrome://conversations/content/i/sign.png", strings.get("signed"));
      if (status & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE)
        addTag("chrome://conversations/content/i/sign.png", strings.get("unknownGood"));
    }

  },
}

registerHook(enigmailHook);
