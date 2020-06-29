/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

/* exported convCompose */
var convCompose = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      convCompose: {
        async send(details) {
          let compFields = Cc[
            "@mozilla.org/messengercompose/composefields;1"
          ].createInstance(Ci.nsIMsgCompFields);
          let params = Cc[
            "@mozilla.org/messengercompose/composeparams;1"
          ].createInstance(Ci.nsIMsgComposeParams);
          let msgSend = Cc[
            "@mozilla.org/messengercompose/send;1"
          ].createInstance(Ci.nsIMsgSend);
          params.composeFields = compFields;

          let sendIdentity;
          for (let account of MailServices.accounts.accounts) {
            for (let identity of account.identities) {
              if (identity.key == details.from) {
                sendIdentity = identity;
                break;
              }
            }
            if (sendIdentity) {
              break;
            }
          }

          if (!sendIdentity) {
            throw new Error("Could not find the specified identity");
          }

          compFields.from = sendIdentity.email;
          compFields.to = details.to;
          compFields.subject = details.subject;

          return new Promise((resolve, reject) => {
            let copyListener = {
              // nsIMsgSendListener
              onStartSending(aMsgID, aMsgSize) {
                console.log("Start sending!");
              },
              onProgress(aMsgID, aProgress, aProgressMax) {
                console.log("on progress!");
              },
              onStatus(aMsgID, aMsg) {
                console.log("status", aMsgID, aMsg);
              },
              onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
                console.log("stop sending", aStatus);
                resolve(aStatus);
              },
              onGetDraftFolderURI(aFolderURI) {},
              onSendNotPerformed(aMsgID, aStatus) {
                console.log("bad send!");
                reject(aStatus);
              },
            };

            msgSend.createAndSendMessage(
              null,
              sendIdentity,
              "",
              compFields,
              false,
              false,
              Ci.nsIMsgSend.nsMsgDeliverNow,
              null,
              "text/plain",
              details.body,
              null,
              null,
              null,
              null,
              copyListener,
              null,
              "",
              Ci.nsIMsgCompType.New
            );
          });
        },
      },
    };
  }
};
