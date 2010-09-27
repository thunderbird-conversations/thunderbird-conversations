var EXPORTED_SYMBOLS = ['registerHook', 'getHooks'];

/* A hook is just a listener whose various methods get called at various stages
 *  of the conversation process.
 *
 * let hook = {
 *  // Called when the given message has been displayed.
 *  onMessageStreamed (aMsgHdr, aIframe) {
 *  },
 * }
 * */
let hooks = [];

function registerHook(h) {
  hooks.push(h);
}

function getHooks() {
  return hooks;
}
