/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MessageFromGloda", "MessageFromDbHdr"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  mimeMsgToContentSnippetAndMeta: "resource:///modules/gloda/GlodaContent.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
  parseMimeLine: "chrome://conversations/content/modules/misc.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  GlodaAttrProviders:
    "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
});

XPCOMUtils.defineLazyGetter(this, "browser", function () {
  return BrowserSim.getBrowser();
});

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */
/**
 * @typedef nsIURI
 * @see https://searchfox.org/mozilla-central/rev/ac36d76c7aea37a18afc9dd094d121f40f7c5441/netwerk/base/nsIURI.idl
 */

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.Message");
});

// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;

const RE_LIST_POST = /<mailto:([^>]+)>/;

/**
 * Handles the gathering of data for an individual message.
 */
class Message {
  constructor(msgHdr) {
    this._msgHdr = msgHdr;
    this._uri = msgHdrGetUri(this._msgHdr);

    // Type of message, e.g. normal or bugzilla.
    this._type = "normal";
    this._id = null;
    this._snippet = "";

    // This one is for display purposes. We should always parse the non-decoded
    // author because there's more information in the encoded form (see #602)
    this._from = parseMimeLine(this._msgHdr.author)[0];
    // Might be filled to something more meaningful later, in case we replace the
    //  sender with something more relevant, like X-Bugzilla-Who.
    this._realFrom = "";
    // The extra test is because recipients fallsback to cc if there's no To:
    // header, and we don't want to display the information twice, then.
    this._to =
      this._msgHdr.recipients != this._msgHdr.ccList
        ? parseMimeLine(this._msgHdr.recipients)
        : [];
    this._cc = this._msgHdr.ccList.length
      ? parseMimeLine(this._msgHdr.ccList)
      : [];
    this._bcc = this._msgHdr.bccList.length
      ? parseMimeLine(this._msgHdr.bccList)
      : [];

    this._attachments = [];
    this._messageHeaderId = null;
    this._glodaMessageId = null;
    this.needsLateAttachments = false;
    this.contentType = "";

    // A list of email addresses
    this.mailingLists = [];
    this.isReplyListEnabled = false;
  }

  get reactData() {
    return {
      id: this._id,
      attachments: this._attachments,
      messageHeaderId: this._messageHeaderId,
      glodaMessageId: this._glodaMessageId,
      messageKey: this._msgHdr.messageKey,
      needsLateAttachments: this.needsLateAttachments,
      realFrom: this._realFrom.email || this._from.email,
      recipientsIncludeLists: this.isReplyListEnabled,
      snippet: this._snippet,
      type: this._type,
      // We look up info on each contact in the Redux reducer;
      // pass this information along so we know what to look up.
      _contactsData: {
        from: [this._from],
        to: this._to,
        cc: this._cc,
        bcc: this._bcc,
      },
    };
  }
}

/**
 * Simple function to extra just the parts of the attachment information
 * that we need into their own object. This simplifies managing the data.
 *
 * @param {object} attachment
 */
function simplifyAttachment(attachment) {
  return {
    contentType: attachment.contentType,
    isExternal: attachment.isExternal,
    name: attachment.name,
    // Fall back to _part for gloda attachments.
    partName: attachment.partName ?? attachment._part,
    size: attachment.size,
    url: attachment.url,
  };
}

/**
 * Handles the gathering of data for a message whose details have been received
 * from queries on the global database.
 */
class MessageFromGloda extends Message {
  constructor(msgHdr, lateAttachments) {
    super(msgHdr);
    this.needsLateAttachments = lateAttachments;
  }

  async init(glodaMsg) {
    this._id = await browser.conversations.getMessageIdForUri(this._uri);
    this._glodaMessageId = glodaMsg.headerMessageID;

    // Our gloda plugin found something for us, thanks dude!
    if (glodaMsg.alternativeSender) {
      this._realFrom = this._from;
      this._from = parseMimeLine(glodaMsg.alternativeSender)[0];
      this._type = "bugzilla";
    }

    // FIXME messages that have no body end up with "..." as a snippet
    this._snippet = glodaMsg._indexedBodyText
      ? glodaMsg._indexedBodyText.substring(0, kSnippetLength - 1)
      : "..."; // it's probably an Enigmail message

    if ("attachmentInfos" in glodaMsg) {
      this._attachments = glodaMsg.attachmentInfos.map(simplifyAttachment);
    }

    if ("contentType" in glodaMsg) {
      this.contentType = glodaMsg.contentType;
    } else {
      this.contentType = "message/rfc822";
    }

    if ("mailingLists" in glodaMsg) {
      this.mailingLists = glodaMsg.mailingLists.map((x) => x.value);
    }

    this.isReplyListEnabled =
      "mailingLists" in glodaMsg && !!glodaMsg.mailingLists.length;
  }
}

/**
 * Handles the gathering of data for a message whose details have been received
 * via message headers.
 */
class MessageFromDbHdr extends Message {
  constructor(msgHdr) {
    super(msgHdr);
  }

  toMimeMsg() {
    return new Promise((resolve, reject) => {
      MsgHdrToMimeMessage(
        this._msgHdr,
        null,
        async (aMsgHdr, aMimeMsg) => {
          try {
            if (aMimeMsg == null) {
              this._snippet = await browser.conversations.getMessageSnippet(
                this._id
              );
              resolve();
              return;
            }

            let [text /* meta */] = mimeMsgToContentSnippetAndMeta(
              aMimeMsg,
              aMsgHdr.folder,
              kSnippetLength
            );
            this._snippet = text;
            let alternativeSender = GlodaAttrProviders.alternativeSender({
              mime: aMimeMsg,
              header: aMsgHdr,
            });
            if (alternativeSender) {
              this._type = "bugzilla";
              this._realFrom = this._from;
              this._from = parseMimeLine(alternativeSender)[0];
            }

            this._attachments = aMimeMsg.allUserAttachments
              .filter((x) => x.isRealAttachment)
              .map(simplifyAttachment);
            this.contentType =
              aMimeMsg.headers["content-type"] || "message/rfc822";
            let listPost = aMimeMsg.get("list-post");
            if (listPost) {
              let r = listPost.match(RE_LIST_POST);
              if (r && r.length) {
                this.mailingLists = [r[1]];
              }
            }

            this.isReplyListEnabled =
              aMimeMsg &&
              aMimeMsg.has("list-post") &&
              RE_LIST_POST.exec(aMimeMsg.get("list-post"));
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        true,
        {
          partsOnDemand: true,
          examineEncryptedParts: true,
        }
      );
    });
  }

  async init() {
    this._id = await browser.conversations.getMessageIdForUri(this._uri);
    this._messageHeaderId = this._msgHdr.messageId;
    // Gloda is not with us, so stream the message... the MimeMsg API says that
    //  the streaming will fail and the underlying exception will be re-thrown in
    //  case the message is not on disk. In that case, the fallback is to just get
    //  the body text and wait for it to be ready. This can be SLOW (like, real
    //  slow). But at least it works. (Setting the fourth parameter to true just
    //  leads to an empty snippet).
    Log.warn(
      "Streaming the message because Gloda has not indexed it, this is BAD"
    );
    try {
      await this.toMimeMsg();
    } catch (ex) {
      Log.error(ex);
      // Remember: these exceptions don't make it out of the callback (XPConnect
      // death trap, can't fight it until we reach level 3 and gain 1200 exp
      // points, so keep training)
      Log.warn("Gloda failed to stream the message properly, this is VERY BAD");
      this._snippet = await browser.conversations.getMessageSnippet(this._id);
    }
  }
}
