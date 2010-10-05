var EXPORTED_SYMBOLS = [];

/*
 * A typical "Thunderbird conversations" plugin would be as follows:
 * - a overlay.xul on whatever is loaded at startup (say, messenger.xul), with
 *   the.xul file including...
 * - ... a overlay.js file that basically does
 *    Components.utils.import("resource://yourext/conv-plugin.js");
 * - in conv-plugin.js:
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

Cu.import("resource://conversations/hook.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Modules.Enigmail");

// This is an example of a "Thunderbird Conversations" plugin. This is how one
//  is expected to interact with the plugin. As an example, we add an extra
//  Enigmail compatibility layer to make sure we use Enigmail to decrypt
//  messages whenever possible.

// If you need more notifications, please ask! (Really!)
Log.debug("Enigmail plugin for Thunderbird Conversations loaded!");

// GetEnigmailSvc needs window to be defined in the scope...
let window = Cc['@mozilla.org/appshell/window-mediator;1']
                 .getService(Ci.nsIWindowMediator)
                 .getMostRecentWindow("mail:3pane");

// Enigmail support, thanks to Patrick Brunschwig!
let hasEnigmail;
let enigmailSvc;
window.addEventListener("load", function () {
  hasEnigmail = (typeof(window.GetEnigmailSvc) == "function");
  if (hasEnigmail) {
    enigmailSvc = window.GetEnigmailSvc();
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
    if (exitCodeObj.value == 0) {
      if (decryptedText.length > 0) {
        bodyElement.textContent = decryptedText;
        bodyElement.style.whiteSpace = "pre-wrap";
      }
      return statusFlagsObj.value;
    }
  } catch (ex) {
    Log.error("Enigmail error: "+ex+" --- "+errorMsgObj.value+"\n");
    return null;
  }
}

let enigmailHook = {
  onMessageStreamed: function _enigmailHook_onMessageStreamed(aMsgHdr, aIframe) {
    let iframeDoc = aIframe.contentDocument;
    let specialTags = aIframe.parentNode.getElementsByClassName("special-tags")[0];
    if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
      let status = tryEnigmail(iframeDoc.body);
      let addTag = function _addTag(url, txt) {
        let li = aIframe.ownerDocument.createElement("li");
        li.innerHTML = ["<img src=\"", url, "\" />", txt].join("");
        specialTags.appendChild(li);
      };
      if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
        addTag("chrome://conversations/content/i/enc.png", "encrypted");
      if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
        addTag("chrome://conversations/content/i/sign.png", "signed");
      if (status & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE)
        addTag("chrome://conversations/content/i/sign.png", "unknown good signature");
    }

  },
}

registerHook(enigmailHook);
