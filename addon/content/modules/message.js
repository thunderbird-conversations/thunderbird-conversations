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
  escapeHtml: "chrome://conversations/content/modules/misc.js",
  htmlToPlainText: "chrome://conversations/content/modules/misc.js",
  MimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
  mimeMsgToContentSnippetAndMeta: "resource:///modules/gloda/GlodaContent.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  parseMimeLine: "chrome://conversations/content/modules/misc.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  Services: "resource://gre/modules/Services.jsm",
  messageActions: "chrome://conversations/content/modules/misc.js",
});

XPCOMUtils.defineLazyGetter(this, "browser", function () {
  return BrowserSim.getBrowser();
});

XPCOMUtils.defineLazyGetter(this, "gMessenger", function () {
  return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
});

const { PluginHelpers } = ChromeUtils.import(
  "chrome://conversations/content/modules/plugins/helpers.js",
  {}
);
const { Contacts } = ChromeUtils.import(
  "chrome://conversations/content/modules/contact.js",
  {}
);
const { Prefs } = ChromeUtils.import(
  "chrome://conversations/content/modules/prefs.js",
  {}
);
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

const RE_BZ_COMMENT = /^--- Comment #\d+ from .* \d{4}.*? ---([\s\S]*)/m;
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

async function dateAccordingToPref(date) {
  try {
    return Prefs.no_friendly_date
      ? dateAsInMessageList(date)
      : await browser.conversations.makeFriendlyDateAgo(date);
  } catch (e) {
    return dateAsInMessageList(date);
  }
}

class Message {
  constructor(aConversation, msgHdr) {
    this._msgHdr = msgHdr;
    this._id = null;
    this._domNode = null;
    this._snippet = "";
    this._conversation = aConversation;

    this._date = new Date(this._msgHdr.date / 1000);
    // This one is for display purposes. We should always parse the non-decoded
    // author because there's more information in the encoded form (see #602)
    this._from = this.parse(this._msgHdr.author)[0];
    // Might be filled to something more meaningful later, in case we replace the
    //  sender with something more relevant, like X-Bugzilla-Who.
    this._realFrom = "";
    // The extra test is because recipients fallsback to cc if there's no To:
    // header, and we don't want to display the information twice, then.
    this._to =
      this._msgHdr.recipients != this._msgHdr.ccList
        ? this.parse(this._msgHdr.recipients)
        : [];
    this._cc = this._msgHdr.ccList.length
      ? this.parse(this._msgHdr.ccList)
      : [];
    this._bcc = this._msgHdr.bccList.length
      ? this.parse(this._msgHdr.bccList)
      : [];
    this.subject = this._msgHdr.mime2DecodedSubject;

    this._uri = msgHdrGetUri(this._msgHdr);
    this._contacts = [];
    this._attachments = [];
    this.needsLateAttachments = false;
    this.contentType = "";
    this.hasRemoteContent = false;
    this.isPhishing = false;
    this.smimeReload = false;

    // A list of email addresses
    this.mailingLists = [];
    this.isReplyListEnabled = false;
    this.isReplyAllEnabled = false;
    this.isEncrypted = false;
    this.bugzillaInfos = {};
    this.notifiedRemoteContentAlready = false;

    // Filled by the conversation, useful to know whether we were initially the
    //  first message in the conversation or not...
    this.initialPosition = -1;

    // Selected state for onSelected function
    this._selected = false;
  }

  // Wraps the low-level header parser stuff.
  //  @param aMimeLine a line that looks like "John <john@cheese.com>, Jane <jane@wine.com>"
  //  @return a list of { email, name } objects
  parse(aMimeLine) {
    return parseMimeLine(aMimeLine);
  }

  // This function is called before toReactData, and allows us to adjust our
  // template data according to the message that came before us.
  updateTmplData(aPrevMsg) {
    let oldInfos = aPrevMsg?.bugzillaInfos;
    if (!oldInfos) {
      oldInfos = {};
    }
    let infos = this.bugzillaInfos;
    let makeArrow = function (oldValue, newValue) {
      if (oldValue) {
        return oldValue + " \u21d2 " + newValue;
      }

      return newValue;
    };
    if (Object.keys(infos).length) {
      let items = [];
      for (let k of [
        "product",
        "component",
        "keywords",
        "severity",
        "status",
        "priority",
        "assigned-to",
        "target-milestone",
      ]) {
        if ((!aPrevMsg || k in oldInfos) && oldInfos[k] != infos[k]) {
          let key = k
            .split("-")
            .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
            .join(" ");
          items.push(key + ": " + makeArrow(oldInfos[k], infos[k]));
        }
      }
      if (infos["changed-fields"]?.trim().length) {
        items.push("Changed: " + infos["changed-fields"]);
      }
      let m = this._snippet.match(RE_BZ_COMMENT);
      if (m?.length && m[1].trim().length) {
        items.push(m[1]);
      }
      if (!items.length) {
        items.push(this._snippet);
      }

      this._snippet = items.join("; ");
    }
  }

  async getContactsFrom(detail) {
    let contacts = [];
    for (const d of detail) {
      // Not using Promise.all here as we want to let the contact manager
      // get the data for the caching to work properly.
      contacts.push([
        await this._conversation._contactManager.getContactFromNameAndEmail(
          d.name,
          d.email
        ),
        d.email,
      ]);
    }
    this._contacts = this._contacts.concat(contacts);
    // false means "no colors"
    return Promise.all(
      contacts.map(([x, email]) => x.toTmplData(Contacts.kTo, email))
    );
  }

  async toReactData() {
    // Ok, brace ourselves for notifications happening during the message load
    //  process.
    addMsgListener(this);

    const messageHeader = await browser.messages.get(this._id);
    if (!messageHeader) {
      throw new Error("Message no longer exists");
    }

    const messageFolderType = messageHeader.folder.type;
    let data = {
      id: this._id,
      date: await dateAccordingToPref(this._date),
      folderName: await browser.conversations.getFolderName(this._id),
      hasRemoteContent: this.hasRemoteContent,
      isDraft: messageFolderType == "drafts",
      isJunk: messageHeader.junk,
      isOutbox: messageFolderType == "outbox",
      isPhishing: this.isPhishing,
      messageKey: this._msgHdr.messageKey,
      msgUri: this._uri,
      multipleRecipients: this.isReplyAllEnabled,
      neckoUrl: msgHdrToNeckoURL(this._msgHdr).spec,
      needsLateAttachments: this.needsLateAttachments,
      read: this.read,
      realFrom: this._realFrom.email || this._from.email,
      recipientsIncludeLists: this.isReplyListEnabled,
      smimeReload: this.smimeReload,
      shortFolderName: messageHeader.folder.name,
      subject: messageHeader.subject,
      snippet: this._snippet,
      starred: messageHeader.flagged,
    };

    // 1) Generate Contact objects
    let contactFrom = [
      await this._conversation._contactManager.getContactFromNameAndEmail(
        this._from.name,
        this._from.email
      ),
      this._from.email,
    ];
    this._contacts.push(contactFrom);
    // true means "with colors"
    data.from = await contactFrom[0].toTmplData(Contacts.kFrom, contactFrom[1]);
    data.from.separator = "";

    data.to = await this.getContactsFrom(this._to);
    data.cc = await this.getContactsFrom(this._cc);
    data.bcc = await this.getContactsFrom(this._bcc);

    // Don't show "to me" if this is a bugzilla email
    // TODO: Make this work again?
    // if (Object.keys(this.bugzillaInfos).length) {
    //   extraClasses.push("bugzilla");
    //   try {
    //     let url = this.bugzillaInfos.url;
    //     data.bugzillaUrl = url;
    //   } catch (e) {
    //     if (e.result != Cr.NS_ERROR_MALFORMED_URI) {
    //       throw e;
    //     }
    //     // why not?
    //   }
    // }

    data = { ...data, ...(await this.toTmplDataForAttachments(data)) };

    data.fullDate = Prefs.no_friendly_date
      ? ""
      : dateAsInMessageList(new Date(this._msgHdr.date / 1000));

    const userTags = await browser.messages.listTags();
    data.tags = messageHeader.tags.map((tagKey) => {
      // The fallback here shouldn't ever happen, but just in case...
      const tagDetails = userTags.find((t) => t.key == tagKey) || {
        color: "#FFFFFF",
        name: "unknown",
      };
      return {
        color: tagDetails.color,
        key: tagDetails.key,
        name: tagDetails.tag,
      };
    });

    return data;
  }

  // Generate Attachment objects
  async toTmplDataForAttachments() {
    let l = this._attachments.length;
    const result = {
      attachments: [],
      attachmentsPlural: await browser.conversations.makePlural(
        browser.i18n.getMessage("pluralForm"),
        browser.i18n.getMessage("attachments.numAttachments"),
        l
      ),
    };
    for (let i = 0; i < l; i++) {
      const att = this._attachments[i];
      // This is bug 630011, remove when fixed
      let formattedSize = browser.i18n.getMessage("attachments.sizeUnknown");
      // -1 means size unknown
      if (att.size != -1) {
        formattedSize = await browser.conversations.formatFileSize(att.size);
      }

      // We've got the right data, push it!
      result.attachments.push({
        size: att.size,
        contentType: att.contentType,
        formattedSize,
        isExternal: att.isExternal,
        name: att.name,
        url: att.url,
        anchor: "msg" + this.initialPosition + "att" + i,
      });
    }
    return result;
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

    const msgData = await this.toReactData();
    // TODO: make getting the window less ugly.
    this._conversation._htmlPane.conversationDispatch(
      messageActions.msgUpdateData({
        msgData,
      })
    );
  }

  async setSmimeReload() {
    this.smimeReload = true;
    const msgData = await this.toReactData();
    // TODO: make getting the window less ugly.
    this._conversation._htmlPane.conversationDispatch(
      messageActions.msgUpdateData({
        msgData,
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
      const msgData = await this.toReactData();
      // TODO: make getting the window less ugly.
      this._conversation._htmlPane.conversationDispatch(
        messageActions.msgUpdateData({
          msgData,
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

  /**
   * This function is called for the "Forward conversation" action. The idea is
   * that we want to forward a plaintext version of the message, so we try and
   * do our best to give this. We're trying not to stream it once more!
   */
  async exportAsHtml() {
    let author = escapeHtml(this._contacts[0][0]._name);
    let authorEmail = this._from.email;
    let authorAvatar = this._contacts[0][0].avatar;
    let authorColor = this._contacts[0][0].color;
    let date = await dateAccordingToPref(new Date(this._msgHdr.date / 1000));
    // We try to convert the bodies to plain text, to enhance the readability in
    // the forwarded conversation. Note: <pre> tags are not converted properly
    // it seems, need to investigate...
    let body = await quoteMsgHdr(this._msgHdr);

    // UGLY HACK. I don't even wanna dig into the internals of the composition
    // window to figure out why this results in an extra <br> being added, so
    // let's just stay sane and use a hack.
    body = body.replace(/\r?\n<br>/g, "<br>");
    body = body.replace(/<br>\r?\n/g, "<br>");
    if (!(body.indexOf("<pre wrap>") === 0)) {
      body = "<br>" + body;
    }
    let html = [
      '<div style="overflow: auto">',
      '<img src="',
      authorAvatar,
      '" style="float: left; height: 48px; margin-right: 5px" />',
      '<b><span><a style="color: ',
      authorColor,
      ' !important; text-decoration: none !important; font-weight: bold" href="mailto:',
      authorEmail,
      '">',
      author,
      "</a></span></b><br />",
      '<span style="color: #666">',
      date,
      "</span>",
      "</div>",
      '<div style="color: #666">',
      body,
      "</div>",
    ].join("");

    return html;
  }
}

function hasIdentity(identityEmails, emailAddress) {
  const email = emailAddress.toLowerCase();
  return identityEmails.some((e) => e.toLowerCase() == email);
}

class MessageFromGloda extends Message {
  constructor(conversation, msgHdr, lateAttachments) {
    super(conversation, msgHdr);
    this.needsLateAttachments = lateAttachments;
  }

  async init(glodaMsg) {
    this._id = await browser.conversations.getMessageIdForUri(this._uri);

    // Our gloda plugin found something for us, thanks dude!
    if (glodaMsg.alternativeSender) {
      this._realFrom = this._from;
      this._from = this.parse(glodaMsg.alternativeSender)[0];
    }

    if (glodaMsg.bugzillaInfos) {
      this.bugzillaInfos = JSON.parse(glodaMsg.bugzillaInfos);
    }

    // FIXME messages that have no body end up with "..." as a snippet
    this._snippet = glodaMsg._indexedBodyText
      ? glodaMsg._indexedBodyText.substring(0, kSnippetLength - 1)
      : "..."; // it's probably an Enigmail message

    if ("attachmentInfos" in glodaMsg) {
      this._attachments = glodaMsg.attachmentInfos;
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
    let seen = new Set();
    const identityEmails = await browser.convContacts.getIdentityEmails({
      includeNntpIdentities: true,
    });
    this.isReplyAllEnabled =
      [glodaMsg.from, ...glodaMsg.to, ...glodaMsg.cc, ...glodaMsg.bcc].filter(
        function (x) {
          let r = !seen.has(x.value) && !hasIdentity(identityEmails, x.value);
          seen.add(x.value);
          return r;
        }
      ).length > 1;
  }
}

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
            let alternativeSender = PluginHelpers.alternativeSender({
              mime: aMimeMsg,
              header: aMsgHdr,
            });
            if (alternativeSender) {
              this._realFrom = this._from;
              this._from = this.parse(alternativeSender)[0];
            }

            this.bugzillaInfos =
              PluginHelpers.bugzilla({ mime: aMimeMsg, header: aMsgHdr }) || {};

            this._attachments = aMimeMsg.allUserAttachments.filter(
              (x) => x.isRealAttachment
            );
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
            let seen = new Set();
            const identityEmails = await browser.convContacts.getIdentityEmails(
              {
                includeNntpIdentities: true,
              }
            );
            this.isReplyAllEnabled =
              [
                ...parseMimeLine(aMimeMsg.get("from"), true),
                ...parseMimeLine(aMimeMsg.get("to"), true),
                ...parseMimeLine(aMimeMsg.get("cc"), true),
                ...parseMimeLine(aMimeMsg.get("bcc"), true),
              ].filter(function (x) {
                let r =
                  !seen.has(x.email) && !hasIdentity(identityEmails, x.email);
                seen.add(x.email);
                return r;
              }).length > 1;

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

XPCOMUtils.defineLazyGetter(this, "timeFormatter", () => {
  return new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });
});

XPCOMUtils.defineLazyGetter(this, "dateAndTimeFormatter", () => {
  return new Services.intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
});

/**
 * A stupid formatting function that uses Services.intl
 * to format a date just like in the message list
 * @param {Date} date a javascript Date object
 * @return {String} a string containing the formatted date
 */
function dateAsInMessageList(date) {
  const now = new Date();
  // Is it today?
  const isToday =
    now.getFullYear() == date.getFullYear() &&
    now.getMonth() == date.getMonth() &&
    now.getDate() == date.getDate();

  const formatter = isToday ? timeFormatter : dateAndTimeFormatter;
  return formatter.format(date);
}

/**
 * Use the mailnews component to stream a message, and process it in a way
 *  that's suitable for quoting (strip signature, remove images, stuff like
 *  that).
 * @param {nsIMsgDBHdr} aMsgHdr The message header that you want to quote
 * @return {Promise}
 *   Returns a quoted string suitable for insertion in an HTML editor.
 *   You can pass this to htmlToPlainText if you're running a plaintext editor
 */
function quoteMsgHdr(aMsgHdr) {
  return new Promise((resolve) => {
    let chunks = [];
    const decoder = new TextDecoder();
    let listener = {
      /** @ignore*/
      setMimeHeaders() {},

      /** @ignore*/
      onStartRequest(aRequest) {},

      /** @ignore*/
      onStopRequest(aRequest, aStatusCode) {
        let data = chunks.join("");
        resolve(data);
      },

      /** @ignore*/
      onDataAvailable(aRequest, aStream, aOffset, aCount) {
        // Fortunately, we have in Gecko 2.0 a nice wrapper
        let data = NetUtil.readInputStreamToString(aStream, aCount);
        // Now each character of the string is actually to be understood as a byte
        //  of a UTF-8 string.
        // So charCodeAt is what we want here...
        let array = [];
        for (let i = 0; i < data.length; ++i) {
          array[i] = data.charCodeAt(i);
        }
        // Yay, good to go!
        chunks.push(decoder.decode(Uint8Array.from(array)));
      },

      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIStreamListener,
        Ci.nsIMsgQuotingOutputStreamListener,
        Ci.nsIRequestObserver,
      ]),
    };
    // Here's what we want to stream...
    let msgUri = msgHdrGetUri(aMsgHdr);
    /**
     * Quote a particular message specified by its URI.
     *
     * @param charset optional parameter - if set, force the message to be
     *                quoted using this particular charset
     */
    //   void quoteMessage(in string msgURI, in boolean quoteHeaders,
    //                     in nsIMsgQuotingOutputStreamListener streamListener,
    //                     in string charset, in boolean headersOnly);
    let quoter = Cc["@mozilla.org/messengercompose/quoting;1"].createInstance(
      Ci.nsIMsgQuote
    );
    quoter.quoteMessage(msgUri, false, listener, "", false, aMsgHdr);
  });
}

/**
 * Recycling the HeaderHandlerBase from mimemsg.js
 */
function HeaderHandler(aHeaders) {
  this.headers = aHeaders;
}

HeaderHandler.prototype = {
  __proto__: MimeMessage.prototype.__proto__, // == HeaderHandlerBase
};

/**
 * Get a nsIURI from a nsIMsgDBHdr
 * @param {nsIMsgDbHdr} aMsgHdr The message header
 * @return {nsIURI}
 */
function msgHdrToNeckoURL(aMsgHdr) {
  let uri = aMsgHdr.folder.getUriForMsg(aMsgHdr);
  let msgService = gMessenger.messageServiceFromURI(uri);

  // Thunderbird 78 and older support.
  if ("GetUrlForUri" in msgService) {
    let neckoURL = {};
    msgService.GetUrlForUri(uri, neckoURL, null);
    return neckoURL.value;
  }
  return msgService.getUrlForUri(uri);
}

/**
 * Get a string containing the body of a messsage.
 * @param {nsIMsgDbHdr} aMessageHeader The message header
 * @param {bool} aStripHtml Keep html?
 * @return {string}
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
