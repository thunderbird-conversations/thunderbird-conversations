var EXPORTED_SYMBOLS = ['registerHook', 'getHooks', 'removeHook'];

/* A hook is just a listener whose various methods get called at various stages
 *  of the conversation process.
 *
 * let hook = {
 *  // Called before the given message is streamed into the <iframe>.
 *  onMessageBeforeStreaming (aMessage) {
 *  },
 *
 *  // Called when the given message has been displayed.
 *  onMessageStreamed (aMsgHdr, aDomNode, aMsgWindow, aMessage) {
 *  },
 *
 *  // Called before the quick reply message is send.
 *  // @param aAddress.params The params to compose the message
 *  // @param aAddress.to The recipients. This is an Array of valid email
 *  //  addresses.
 *  // @param aAddress.cc Same remark.
 *  // @param aAddress.bcc Same remark.
 *  // @param aEditor The textarea node which value is mail body.
 *  // @param aStatus.canceled Sending the message is canceled.
 *  // @param aStatus.securityInfo An object for PGM/MIME message.
 *  // @return aStatus Same remark.
 *  onMessageBeforeSend: function (aAddress, aEditor, aStatus) {
 *  },
 *
 *  // Called when quick reply body is composed.
 *  // @param aMessage Original message instance.
 *  // @param aBody Quoted body of original message.
 *  // @return aBody Same remark.
 *  onReplyComposed (aMessage, aBody) {
 *  },
 *
 *  // Called when a message has been focused while building a
 *  // conversation.
 *  // @param aMessage Focused message instance.
 *  onFocusMessage (aMessage) {
 *  },
 * }
 *
 * If you need something else, just ask!
 * */
let hooks = [];

function registerHook(h) {
  hooks.push(h);
}

function removeHook(h) {
  hooks = hooks.filter(function (x) x != h);
}

function getHooks() {
  return hooks;
}
