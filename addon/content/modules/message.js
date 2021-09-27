/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MessageFromGloda", "MessageFromDbHdr"];

// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;

/**
 * Handles the gathering of data for an individual message.
 */
class Message {
  constructor(msgId, msgHdr) {
    this.messageKey = msgHdr.messageKey;
    this.data = {
      id: msgId,
      messageHeaderId: null,
      glodaMessageId: null,
      attachments: [],
      getFullRequired: false,
      needsLateAttachments: false,
      // The from can be overridden, e.g. in the case of bugzilla, so this field
      // is always the email address this was originally from.
      realFrom: msgHdr.author,
      recipientsIncludeLists: false,
      snippet: "",
      // Type of message, e.g. normal or bugzilla.
      type: "normal",
      // We look up info on each contact in the Redux reducer;
      // pass this information along so we know what to look up.
      _contactsData: {
        // This one is for display purposes. We should always parse the non-decoded
        // author because there's more information in the encoded form (see #602)
        from: msgHdr.author,
        // The extra test is because recipients fallsback to cc if there's no To:
        // header, and we don't want to display the information twice, then.
        to: msgHdr.recipients != msgHdr.ccList ? msgHdr.recipients : null,
        cc: msgHdr.ccList.length ? msgHdr.ccList : null,
        bcc: msgHdr.bccList.length ? msgHdr.bccList : null,
      },
    };
  }

  get reactData() {
    return this.data;
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
  constructor(msgId, msgHdr, glodaMsg, lateAttachments) {
    super(msgId, msgHdr);
    this.data.needsLateAttachments = lateAttachments;

    this.data.glodaMessageId = glodaMsg.headerMessageID;

    // Our gloda plugin found something for us, thanks dude!
    if (glodaMsg.alternativeSender) {
      this.data._contactsData.from = glodaMsg.alternativeSender[0];
      this.data.type = "bugzilla";
    }

    // FIXME messages that have no body end up with "..." as a snippet
    this.data.snippet = glodaMsg._indexedBodyText
      ? glodaMsg._indexedBodyText.substring(0, kSnippetLength - 1)
      : "..."; // it's probably an Enigmail message

    if ("attachmentInfos" in glodaMsg) {
      this.data.attachments = glodaMsg.attachmentInfos.map(simplifyAttachment);
    }

    this.data.recipientsIncludeLists =
      "mailingLists" in glodaMsg && !!glodaMsg.mailingLists.length;
  }
}

/**
 * Handles the gathering of data for a message whose details have been received
 * via message headers.
 */
class MessageFromDbHdr extends Message {
  constructor(msgId, msgHdr) {
    super(msgId, msgHdr);
    this.data.messageHeaderId = msgHdr.messageId;
    this.data.getFullRequired = true;
  }
}
