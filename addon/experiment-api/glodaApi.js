/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
});

/* exported convGloda */
var convGloda = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      convGloda: {
        queryConversationMessages: new ExtensionCommon.EventManager({
          context,
          name: "convContacts.queryConversationMessages",
          register(
            fire,
            msgIds
          ) {
            console.log(msgIds);
            fire.async({ name: "hello" });

            return () => {
              // Cleanup
            };
          },
        }).api(),
      },
    };
  }
};
