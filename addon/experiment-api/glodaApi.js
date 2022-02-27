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

/* exported convGloda */
var convGloda = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      convGloda: {
        queryConversationMessages: new ExtensionCommon.EventManager({
          context,
          name: "convContacts.queryConversationMessages",
          register(fire, msgIds) {
            console.log(msgIds);

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
    fire.async({ inital: [] });
    return;
  }
  console.log("got", intermediateResults);

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
    console.log("onItemsAdded", items);
  }
  onItemsModified(items) {
    console.log("onItemsModified", items);
  }
  onItemsRemoved(items) {
    console.log("onItemsRemoved", items);
  }
  async onQueryCompleted(collection) {
    console.log("onQueryCompleted", collection);
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

    console.log([...messageIdMap.values()]);

    let messages = [];
    for (let msg of messageIdMap.values()) {
      let id = await this.translateMessage(msg);
      if (id != undefined) {
        messages.push(id);
      }
    }

    // TODO: Sort results on date.
    // TODO: Return what we can initally without translating the message.
    // e.g. read status, date, subject, snippet - anything without async calls
    // - enough to build skelton display.
    console.log(messages);
    this.fire.async({ initial: messages });

    // Then, fill out full message details from conversion with ids & return
    // those. Can we do the important ones first? aka expanded? Then the
    // not so important ones? Might need to move the expansion logic into here...
    // Maybe try perf first? Suspect expansion logic will need to move though :(
    // this.fire.async({ full: messages });
  }

  translateMessage(msg) {
    if ("headerMessageID" in msg) {
      return this.translateGlodaMessage(msg);
    }
    return this.translateStandardMessage(msg);
  }

  async translateGlodaMessage(msg) {
    let message = await this.context.extension.messageManager.convert(
      msg.folderMessage
    );
    return message?.id;
  }

  async translateStandardMessage(msg) {
    let message = await this.context.extension.messageManager.convert(msg);
    return message?.id;
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
