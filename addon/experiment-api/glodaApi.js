/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Gloda: "resource:///modules/gloda/GlodaPublic.jsm",
});

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

/**
 * @typedef GlodaMessage
 * @see https://searchfox.org/comm-central/rev/6355da49d4d258b049f63ffa1c945fa467fb2adf/mailnews/db/gloda/modules/GlodaDataModel.jsm#549
 */

/* exported convGloda */
var convGloda = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      convGloda: {
        queryConversationMessages: new ExtensionCommon.EventManager({
          context,
          name: "convContacts.queryConversationMessages",
          register(fire, msgIds) {
            let status = { stopQuery: false };

            let msgHdrs = msgIds.map((id) =>
              context.extension.messageManager.get(id)
            );

            startQuery(msgHdrs, status, fire, context).catch(console.error);

            return () => {
              // Cleanup
              status.stopQuery = true;
              if (status.killQuery) {
                status.killQuery();
              }
            };
          },
        }).api(),
      },
    };
  }
};

// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;

async function startQuery(msgHdrs, status, fire, context) {
  // This is a "classic query", i.e. the one we use all the time: just obtain
  //  a GlodaMessage for the selected message headers, and then pick the
  //  first one, get its underlying GlodaConversation object, and then ask for
  //  the GlodaConversation's messages.
  let intermediateResults = await getGlodaMessages(msgHdrs);

  if (status.stopQuery) {
    return;
  }

  if (!intermediateResults.length) {
    // Gloda has nothing, so return the list of message headers selected.
    let initial = [];
    for (let hdr of msgHdrs) {
      let msg = await GlodaListener.translateStandardMessage(context, hdr);
      if (msg) {
        initial.push(msg);
      }
    }
    fire.async({ initial });
    return;
  }

  getAndObserveConversationThread(
    msgHdrs,
    intermediateResults,
    status,
    fire,
    context
  );
}

function getGlodaMessages(msgHdrs) {
  return new Promise((resolve, reject) => {
    Gloda.getMessageCollectionForHeaders(
      msgHdrs,
      {
        onItemsAdded(items) {
          resolve(items);
        },
        onItemsModified() {},
        onItemsRemoved() {},
        onQueryCompleted(collection) {},
      },
      null
    );
  });
}

/**
 *
 */
class GlodaListener {
  constructor(msgHdrs, intermediateResults, fire, context) {
    this.initialQueryComplete = false;
    this.msgHdrs = msgHdrs;
    this.intermediateResults = intermediateResults;
    this.fire = fire;
    this.context = context;
  }

  onItemsAdded(items) {
    // The first batch of messages will be treated in onQueryCompleted, this
    //  handler is only interested in subsequent messages.
    if (!this.initialQueryComplete) {
      return;
    }
    console.log("onItemsAdded", items);
    let messages = [];
    for (let msg of items) {
      let newMsg = this.translateGlodaMessage(msg);
      if (newMsg) {
        messages.push(newMsg);
      }
    }
    if (messages.length) {
      this.fire.async({ added: messages });
    }
  }
  onItemsModified(items) {
    if (!this.initialQueryComplete) {
      return;
    }
    console.log("onItemsModified", items);
    let messages = [];
    for (let msg of items) {
      let newMsg = this.translateGlodaMessage(msg);
      if (newMsg) {
        messages.push(newMsg);
      }
    }
    if (messages.length) {
      this.fire.async({ modified: messages });
    }
  }
  onItemsRemoved(items) {
    if (!this.initialQueryComplete) {
      return;
    }
    console.log("onItemsRemoved", items);
    let msgIds = [];
    for (let msg of items) {
      let message = this.context.extension.messageManager.convert(
        msg.folderMessage
      );
      if (!message) {
        continue;
      }
      if (message) {
        msgIds.push(message.id);
      }
    }
    this.fire.async({ removed: msgIds });
  }
  onQueryCompleted(collection) {
    if (this.initialQueryComplete) {
      console.error("was not expecting initial query complete a second time!");
      return;
    }

    this.initialQueryComplete = true;

    // Beware, some bad things might have happened in the meanwhile...
    this.msgHdrs = this.msgHdrs.filter((msgHdr) =>
      msgHdr?.folder.msgDatabase.ContainsKey(msgHdr.messageKey)
    );

    let messageIdMap = new Map();
    // Merge the final list with the intermediate list.
    for (let item of [...collection.items, ...this.intermediateResults]) {
      messageIdMap.set(item.headerMessageID, item);
    }

    // Also merge the initial list - Gloda might not have indexed all of the
    // messages yet.
    for (let msgHdr of this.msgHdrs) {
      if (!messageIdMap.has(msgHdr.messageId)) {
        messageIdMap.set(msgHdr.messageId, msgHdr);
      }
    }

    let messages = [];
    for (let msg of messageIdMap.values()) {
      let newMsg =
        "headerMessageID" in msg
          ? this.translateGlodaMessage(msg)
          : GlodaListener.translateStandardMessage(this.context, msg);
      if (newMsg) {
        messages.push(newMsg);
      }
    }

    // TODO: We can probably return the pre-translated Gloda messages with
    // some combination of the message headers we already have.
    // For threads with a large set of messages in alternate folders this should
    // help a lot with reducing the time to load.
    // It probably won't help if all the messages are the selected ones,
    // since we would still need to load the headers to inject into the gloda
    // query and for the basic details.

    this.fire.async({ initial: messages });
  }

  /**
   * Translates a gloda message into a format returnable by the API.
   *
   * @param {GlodaMessage} msg
   *   The message from Gloda to convert.
   */
  translateGlodaMessage(msg) {
    let message = this.context.extension.messageManager.convert(
      msg.folderMessage
    );
    if (!message) {
      return null;
    }
    message.source = "gloda";
    message.snippet =
      msg.indexedBodyText?.substring(0, kSnippetLength - 1) || "...";

    let msgHdr = msg.folderMessage;
    message.needsLateAttachments =
      (!(msgHdr.folder instanceof Ci.nsIMsgLocalMailFolder) &&
        !(msgHdr.folder.flags & Ci.nsMsgFolderFlags.Offline)) || // online IMAP
      msg.isEncrypted || // encrypted message
      (msg.contentType + "").search(/^multipart\/encrypted(;|$)/i) == 0; // encrypted message

    if (msg.alternativeSender?.length) {
      message.alternativeSender = msg.alternativeSender;
      message.type = "bugzilla";
    } else {
      message.type = "normal";
    }

    if ("attachmentInfos" in msg) {
      message.attachments = msg.attachmentInfos.map(this.simplifyAttachment);
    }

    message.recipientsIncludeLists = !!msg.mailingLists?.length;

    return message;
  }

  /**
   * Translates a standard msgHdr into a format returnable by the API.
   *
   * @param {object} context
   *   The extension context.
   * @param {nsIMsgDBHdr} msg
   *   The msgHdr for the message.
   */
  static translateStandardMessage(context, msg) {
    let message = context.extension.messageManager.convert(msg);
    message.getFullRequired = true;
    message.source = "standard";
    message.type = "normal";
    message.attachments = [];
    message.recipientsIncludeLists = false;
    return message;
  }

  /**
   * Simple function to extra just the parts of the attachment information
   * that we need into their own object. This simplifies managing the data.
   *
   * @param {object} attachment
   */
  simplifyAttachment(attachment) {
    return {
      contentType: attachment.contentType,
      name: attachment.name,
      // Fall back to _part for gloda attachments.
      partName: attachment.partName ?? attachment._part,
      size: attachment.size,
      url: attachment.url,
    };
  }
}

function getAndObserveConversationThread(
  msgHdrs,
  intermediateResults,
  status,
  fire,
  context
) {
  let glodaListener = new GlodaListener(
    msgHdrs,
    intermediateResults,
    fire,
    context
  );

  let query = intermediateResults[0].conversation.getMessagesCollection(
    glodaListener,
    true
  );

  status.killQuery = () => {
    query.listener = null;
    glodaListener = null;
  };
}
