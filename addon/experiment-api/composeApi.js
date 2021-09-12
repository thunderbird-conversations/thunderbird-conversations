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

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

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
            let sendStatus;
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
                sendStatus = aStatus;
                if (aStatus) {
                  reject(aStatus);
                }
              },
              onGetDraftFolderURI(aFolderURI) {},
              onSendNotPerformed(aMsgID, aStatus) {
                console.log("bad send!");
                reject(aStatus);
              },
              // nsIMsgCopyServiceListener
              OnStartCopy() {
                console.log("onStartCopy");
              },
              SetMessageKey() {
                console.log("setMessageKey");
              },
              GetMessageId() {
                console.log("getMessageId");
              },
              OnStopCopy() {
                console.log("onStopCopy");
                resolve(sendStatus);
              },
              QueryInterface: ChromeUtils.generateQI([
                "nsIMsgSendListener",
                "nsIMsgCopyServiceListener",
              ]),
            };

            let msgProgress = {
              processCanceledByUser: false,
              openProgressDialog() {
                console.log("openProgressDialog");
              },
              closeProgressDialog() {
                console.log("closeProgressDialog");
              },
              registerListener() {
                console.log("registerListener");
              },
              unregisterListener() {
                console.log("unregisterListener");
              },
              onStateChange(webProgress, request, stateFlags, status) {
                console.log("state change", stateFlags, status);
              },
              onProgressChange(
                webProgress,
                request,
                self,
                selfMax,
                total,
                totalMax
              ) {
                console.log("onProgressChange", self, selfMax, total, totalMax);
              },
              onLocationChange() {
                console.log("onLocationChange");
              },
              onStatusChange(webProgress, request, status, message) {
                console.log("onStatusChange", status, message);
              },
              onSecurityChange() {
                console.log("onSecurityChange");
              },
              onContentBlockingEvent() {
                console.log("onContentBlockingEvent");
              },
            };

            let body = details.body || "";
            if (!body.endsWith("\n")) {
              body += "\n";
            }

            try {
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
                body,
                null,
                null,
                null,
                msgProgress,
                copyListener,
                null,
                "",
                Ci.nsIMsgCompType.New
              );
            } catch (ex) {
              reject(ex);
            }
          });
        },
      },
    };
  }
};
