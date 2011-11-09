var EXPORTED_SYMBOLS = [];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://conversations/hook.js");
Cu.import("resource://conversations/log.js");
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");


let Log = setupLogging("Conversations.Modules.VirtualIdentity");

let mainWindow = getMail3Pane();

let virtualIdentityHook = {
  onComposeSessionChanged: function _virtualIdentityHook_onComposeSessionChanged(aComposeSession, aMessage, aAddress) {
    mainWindow.virtualIdentityExtension.conversationHook.onComposeSessionChanged(aComposeSession, aAddress, Log);
  },
  
  onMessageBeforeSendOrPopout_early: function _enigmailHook_onMessageBeforeSendOrPopout_early(aAddress, aEditor, aStatus, aPopout) {
    if (aStatus.canceled)
      return aStatus;
    return mainWindow.virtualIdentityExtension.conversationHook.onMessageBeforeSendOrPopout(aAddress, aStatus, aPopout, Log);
  },
  
  onStopSending: function _virtualIdentityHook_onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    mainWindow.virtualIdentityExtension.conversationHook.onStopSending();
  },
  
  onRecipientAdded: function _virtualIdentityHook_onRecipientAdded(aData, aType, aCount) {
    mainWindow.virtualIdentityExtension.conversationHook.onRecipientAdded(aData, aType, aCount, Log);
  }
}

// virtual Identity support
let hasVirtualIdentity;
mainWindow.addEventListener("load", function () {
  hasVirtualIdentity = (("virtualIdentityExtension" in mainWindow) && typeof(mainWindow.virtualIdentityExtension) == "object");
  if (hasVirtualIdentity) {
    Log.debug("Virtual Identity plugin for Thunderbird Conversations loaded!");
    registerHook(virtualIdentityHook);
  }
  else Log.debug("Virtual Identity doesn't seem to be installed...");
}, false);
