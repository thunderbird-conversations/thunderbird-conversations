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
  htmlToPlainText: "chrome://conversations/content/modules/misc.js",
  mimeMsgToContentSnippetAndMeta: "resource:///modules/gloda/GlodaContent.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
  parseMimeLine: "chrome://conversations/content/modules/misc.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  Services: "resource://gre/modules/Services.jsm",
  messageActions: "chrome://conversations/content/modules/misc.js",
  GlodaAttrProviders:
    "chrome://conversations/content/modules/plugins/glodaAttrProviders.js",
});

XPCOMUtils.defineLazyGetter(this, "browser", function () {
  return BrowserSim.getBrowser();
});

XPCOMUtils.defineLazyGetter(this, "gMessenger", function () {
  return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
});

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */
/**
 * @typedef nsIURI
 * @see https://searchfox.org/mozilla-central/rev/ac36d76c7aea37a18afc9dd094d121f40f7c5441/netwerk/base/nsIURI.idl
 */

const { topMail3Pane } = ChromeUtils.import(
  "chrome://conversations/content/modules/misc.js",
  {}
);
const { getHooks } = ChromeUtils.import(
  "chrome://conversations/content/modules/hook.js",
  {}
);

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.Message");
});

// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;

const RE_LIST_POST = /<mailto:([^>]+)>/;

// Add in the global message listener table a weak reference to the given
//  Message object. The monkey-patch which intercepts the "remote content
//  blocked" notification will then look for a suitable listener and notify it
//  of the aforementioned event.
function addMsgListener(aMessage) {
  let window = topMail3Pane(aMessage);
  let weakPtr = Cu.getWeakReference(aMessage);
  let msgListeners = window.Conversations.msgListeners;
  let messageId = aMessage._msgHdr.messageId;
  if (!msgListeners.has(messageId)) {
    msgListeners.set(messageId, []);
  }
  msgListeners.get(messageId).push(weakPtr);
}

/**
 * Handles the gathering of data for an individual message.
 */
class Message {
  constructor(aConversation, msgHdr) {
    this._msgHdr = msgHdr;
    // Type of message, e.g. normal or bugzilla.
    this._type = "normal";
    this._id = null;
    this._domNode = null;
    this._snippet = "";
    this._conversation = aConversation;

    this._date = new Date(this._msgHdr.date / 1000);
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

    this._uri = msgHdrGetUri(this._msgHdr);
    this._attachments = [];
    this._messageHeaderId = null;
    this._glodaMessageId = null;
    this.needsLateAttachments = false;
    this.contentType = "";
    this.hasRemoteContent = false;
    this.isPhishing = false;
    this.smimeReload = false;

    // A list of email addresses
    this.mailingLists = [];
    this.isReplyListEnabled = false;
    this.isEncrypted = false;
    this.notifiedRemoteContentAlready = false;

    // Filled by the conversation, useful to know whether we were initially the
    //  first message in the conversation or not...
    this.initialPosition = -1;

    // Selected state for onSelected function
    this._selected = false;
  }

  toReactData() {
    // Ok, brace ourselves for notifications happening during the message load
    //  process.
    addMsgListener(this);

    return {
      id: this._id,
      attachments: this._attachments,
      messageHeaderId: this._messageHeaderId,
      glodaMessageId: this._glodaMessageId,
      hasRemoteContent: this.hasRemoteContent,
      isPhishing: this.isPhishing,
      messageKey: this._msgHdr.messageKey,
      msgUri: this._uri,
      neckoUrl: msgHdrToNeckoURL(this._msgHdr).spec,
      needsLateAttachments: this.needsLateAttachments,
      realFrom: this._realFrom.email || this._from.email,
      recipientsIncludeLists: this.isReplyListEnabled,
      smimeReload: this.smimeReload,
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

  // The global monkey-patch finds us through the weak pointer table and
  //  notifies us.
  async onMsgHasRemoteContent() {
    if (this.notifiedRemoteContentAlready) {
      return;
    }
    this.notifiedRemoteContentAlready = true;
    this.hasRemoteContent = true;
    Log.debug("This message's remote content was blocked");

    this._conversation._htmlPane.conversationDispatch(
      messageActions.setHasRemoteContent({
        id: this._id,
        hasRemoteContent: true,
      })
    );
  }

  async setSmimeReload() {
    this.smimeReload = true;
    this._conversation._htmlPane.conversationDispatch(
      messageActions.setSmimeReload({
        id: this._id,
        smimeReload: true,
      })
    );
  }

  // This function should be called whenever the message is selected
  // by focus, click, scrollNodeIntoView, etc.
  onSelected() {
    if (this._selected) {
      return;
    }

    // We run below code only for the first time after messages selected.
    Log.debug("A message is selected:", this._uri);
    for (let { message } of this._conversation.messages) {
      message._selected = message == this;
    }

    try {
      for (let h of getHooks()) {
        if (typeof h.onMessageSelected == "function") {
          h.onMessageSelected(this);
        }
      }
    } catch (e) {
      console.error("Plugin returned an error:", e);
    }
  }

  get iframe() {
    return this._domNode.getElementsByTagName("iframe")[0];
  }

  // Convenience properties
  get read() {
    return this._msgHdr.isRead;
  }

  addSpecialTag(tagDetails) {
    this._conversation._htmlPane.conversationDispatch(
      messageActions.msgAddSpecialTag({
        tagDetails,
        uri: this._uri,
      })
    );
  }

  removeSpecialTag(tagDetails) {
    this._conversation._htmlPane.conversationDispatch(
      messageActions.msgRemoveSpecialTag({
        tagDetails,
        uri: this._uri,
      })
    );
    // this._specialTags = this.specialTags.filter(t => t.name != tagDetails.name);
  }

  streamMessage(msgWindow, docshell) {
    // Pre msg loading.
    for (let h of getHooks()) {
      try {
        if (typeof h.onMessageBeforeStreaming == "function") {
          h.onMessageBeforeStreaming(this);
        }
      } catch (e) {
        console.error("Plugin returned an error:", e);
      }
    }

    addMsgListener(this);

    const neckoUrl = msgHdrToNeckoURL(this._msgHdr).spec;

    const messageService = gMessenger.messageServiceFromURI(neckoUrl);
    messageService.DisplayMessage(
      this._uri + "&markRead=false",
      docshell,
      msgWindow,
      undefined,
      undefined,
      {}
    );
  }

  postStreamMessage(mainWindow, iframe) {
    // Notify hooks that we just finished displaying a message. Must be
    //  performed now, not later. This gives plugins a chance to modify
    //  the DOM of the message (i.e. decrypt it) before we tweak the
    //  fonts and stuff.
    Services.tm.dispatchToMainThread(() => {
      for (let h of getHooks()) {
        try {
          if (typeof h.onMessageStreamed == "function") {
            h.onMessageStreamed(this._msgHdr, iframe, mainWindow, this);
          }
        } catch (e) {
          console.error("Plugin returned an error:", e);
        }
      }

      this._checkForPhishing(iframe).catch(console.error);
    });
  }

  msgPluginNotification(win, notificationType, extraData) {
    Services.tm.dispatchToMainThread(() => {
      for (let h of getHooks()) {
        try {
          if (typeof h.onMessageNotification == "function") {
            h.onMessageNotification(win, notificationType, extraData);
          }
        } catch (ex) {
          console.error("Plugin returned an error:", ex);
        }
      }
    });
  }

  msgPluginTagClick(win, event, ...extraData) {
    let newEvent = {
      button: event.button,
    };
    Services.tm.dispatchToMainThread(() => {
      for (let h of getHooks()) {
        try {
          if (typeof h.onMessageTagClick == "function") {
            h.onMessageTagClick(win, newEvent, ...extraData);
          }
        } catch (ex) {
          console.error("Plugin returned an error:", ex);
        }
      }
    });
  }

  async _checkForPhishing(iframe) {
    if (!Services.prefs.getBoolPref("mail.phishing.detection.enabled")) {
      return;
    }

    if (this._msgHdr.getUint32Property("notAPhishMessage")) {
      return;
    }

    // If the message contains forms with action attributes, warn the user.
    let formNodes =
      iframe.contentWindow.document.querySelectorAll("form[action]");

    const neckoUrl = msgHdrToNeckoURL(this._msgHdr).spec;
    const url = Services.io
      .newURI(neckoUrl)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);

    try {
      // nsIMsgMailNewsUrl.folder can throw an NS_ERROR_FAILURE, especially if
      // we are opening an .eml file.
      var folder = url.folder;

      // Ignore nntp and RSS messages.
      if (folder.server.type == "nntp" || folder.server.type == "rss") {
        return;
      }

      // Also ignore messages in Sent/Drafts/Templates/Outbox.
      let outgoingFlags =
        Ci.nsMsgFolderFlags.SentMail |
        Ci.nsMsgFolderFlags.Drafts |
        Ci.nsMsgFolderFlags.Templates |
        Ci.nsMsgFolderFlags.Queue;
      if (folder.isSpecialFolder(outgoingFlags, true)) {
        return;
      }
    } catch (ex) {
      if (
        ex.result != Cr.NS_ERROR_FAILURE &&
        ex.result != Cr.NS_ERROR_ILLEGAL_VALUE
      ) {
        throw ex;
      }
    }
    if (
      Services.prefs.getBoolPref(
        "mail.phishing.detection.disallow_form_actions"
      ) &&
      formNodes.length
    ) {
      this.isPhishing = true;
      this._conversation._htmlPane.conversationDispatch(
        messageActions.setPhishing({
          id: this._id,
          isPhishing: true,
        })
      );
    }
  }

  /**
   * Returns the message's text, assuming it's been streamed already (i.e.
   * expanded). We're extracting a plaintext version of the body from what's in
   * the <iframe>, modulo a few cosmetic cleanups. The collapsed quoted parts
   * are *not* included.
   */
  get bodyAsText() {
    // This function tries to clean up the email's body by removing hidden
    // blockquotes, removing signatures, etc. Note: sometimes there's a little
    // quoted text left over, need to investigate why...
    let prepare = function (aNode) {
      let node = aNode.cloneNode(true);
      for (let x of node.getElementsByClassName("moz-txt-sig")) {
        if (x) {
          x.remove();
        }
      }
      for (let x of node.querySelectorAll("blockquote, div")) {
        if (x?.style.display == "none") {
          x.remove();
        }
      }
      return node.innerHTML;
    };
    let body = htmlToPlainText(
      prepare(this.iframe.contentWindow.document.body)
    );
    // Remove trailing newlines, it gives a bad appearance.
    body = body.replace(/[\n\r]*$/, "");
    return body;
  }

  /**
   * Fills the bodyContainer <div> with the plaintext contents of the message
   * for printing.
   */
  dumpPlainTextForPrinting() {
    // printConversation from content/stub.html calls us, regardless of whether
    // we've streamed the message yet, or not, so the iframe might not be ready
    // yet. That's ok, since we will print the snippet anyway.
    if (this.iframe) {
      // Fill the text node that will end up being printed. We can't
      // really print iframes, they don't wrap...
      let bodyContainer =
        this._domNode.getElementsByClassName("body-container")[0];
      bodyContainer.textContent = this.bodyAsText;
    }
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
  constructor(conversation, msgHdr, lateAttachments) {
    super(conversation, msgHdr);
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

    if ("isEncrypted" in glodaMsg) {
      this.isEncrypted = glodaMsg.isEncrypted;
    }

    if (
      (glodaMsg.contentType + "").search(/^multipart\/encrypted(;|$)/i) == 0
    ) {
      this.isEncrypted = true;
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
  constructor(conversation, msgHdr) {
    super(conversation, msgHdr);
  }

  toMimeMsg() {
    return new Promise((resolve, reject) => {
      MsgHdrToMimeMessage(
        this._msgHdr,
        null,
        async (aMsgHdr, aMimeMsg) => {
          try {
            if (aMimeMsg == null) {
              await this._fallbackSnippet();
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
            Log.debug(this.mailingLists);

            this.isReplyListEnabled =
              aMimeMsg &&
              aMimeMsg.has("list-post") &&
              RE_LIST_POST.exec(aMimeMsg.get("list-post"));

            let findIsEncrypted = (x) =>
              x.isEncrypted ||
              (x.parts ? x.parts.some(findIsEncrypted) : false);
            this.isEncrypted = findIsEncrypted(aMimeMsg);
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
      await this._fallbackSnippet();
    }
  }

  async _fallbackSnippet() {
    Log.debug("Using the default streaming code...");
    let body = msgHdrToMessageBody(this._msgHdr, true, kSnippetLength);
    Log.debug("Body is", body);
    this._snippet = body.substring(0, kSnippetLength - 1);
  }
}

/**
 * Get a nsIURI from a nsIMsgDBHdr
 *
 * @param {nsIMsgDBHdr} aMsgHdr The message header
 * @returns {nsIURI}
 */
function msgHdrToNeckoURL(aMsgHdr) {
  let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  let msgService = gMessenger.messageServiceFromURI(uri);

  // Thunderbird 78 and older support.
  if ("nsIAbListener" in Ci) {
    let neckoURL = {};
    msgService.GetUrlForUri(uri, neckoURL, null);
    return neckoURL.value;
  }
  return msgService.getUrlForUri(uri);
}

/**
 * Get a string containing the body of a messsage.
 *
 * @param {nsIMsgDBHdr} aMessageHeader The message header
 * @param {boolean} aStripHtml Keep html?
 * @param {number} aLength
 * @returns {string}
 */
function msgHdrToMessageBody(aMessageHeader, aStripHtml, aLength) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let listener = Cc[
    "@mozilla.org/network/sync-stream-listener;1"
  ].createInstance(Ci.nsISyncStreamListener);
  let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);
  messenger
    .messageServiceFromURI(uri)
    .streamMessage(uri, listener, null, null, false, "");
  let folder = aMessageHeader.folder;
  /*
   * AUTF8String getMsgTextFromStream(in nsIInputStream aStream, in ACString aCharset,
                                      in unsigned long aBytesToRead, in unsigned long aMaxOutputLen,
                                      in boolean aCompressQuotes, in boolean aStripHTMLTags,
                                      out ACString aContentType);
  */
  return folder.getMsgTextFromStream(
    listener.inputStream,
    aMessageHeader.Charset,
    2 * aLength,
    aLength,
    false,
    aStripHtml,
    {}
  );
}
