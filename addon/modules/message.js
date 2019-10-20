/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = [
  "MessageFromGloda", "MessageFromDbHdr",
  "ConversationKeybindings", "MessageUtils", "watchIFrame",
];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  GlodaUtils: "resource:///modules/gloda/utils.js",
  isLightningInstalled: "resource://conversations/modules/plugins/lightning.js",
  MailServices: "resource:///modules/MailServices.jsm",
  makeFriendlyDateAgo: "resource:///modules/templateUtils.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/mimemsg.js",
  mimeMsgToContentSnippetAndMeta: "resource:///modules/gloda/connotent.js",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Services: "resource://gre/modules/Services.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});
const {
  dateAsInMessageList, entries, escapeHtml, getIdentityForEmail,
  isOSX, parseMimeLine, sanitize,
} = ChromeUtils.import("resource://conversations/modules/stdlib/misc.js");

// It's not really nice to write into someone elses object but this is what the
// Services object is for.  We prefix with the "m" to ensure we stay out of their
// namespace.
XPCOMUtils.defineLazyGetter(Services, "mMessenger",
                            function() {
                              return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
                            });

let strings = new StringBundle("chrome://conversations/locale/message.properties");

const {
  msgHdrsArchive, msgHdrGetHeaders, msgHdrGetUri, msgHdrIsDraft, msgHdrIsJunk,
  msgHdrsDelete, msgHdrsMarkAsRead, msgHdrGetTags, msgHdrSetTags, msgHdrToNeckoURL,
  msgHdrToMessageBody, msgUriToMsgHdr,
} = ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js", {});
const {htmlToPlainText, quoteMsgHdr} =
  ChromeUtils.import("resource://conversations/modules/stdlib/compose.js", {});
const {PluginHelpers} =
  ChromeUtils.import("resource://conversations/modules/plugins/helpers.js", {});
const {Contacts} = ChromeUtils.import("resource://conversations/modules/contact.js", {});
const {Prefs} = ChromeUtils.import("resource://conversations/modules/prefs.js", {});
const {folderName, iconForMimeType, topMail3Pane} =
  ChromeUtils.import("resource://conversations/modules/misc.js", {});
const {getHooks} = ChromeUtils.import("resource://conversations/modules/hook.js", {});
const {dumpCallStack, setupLogging} = ChromeUtils.import("resource://conversations/modules/log.js", {});

let Log = setupLogging("Conversations.Message");
// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;
const kViewerUrl = "chrome://conversations/content/pdfviewer/wrapper.xul?uri=";

let makeViewerUrl = (name, url) =>
  kViewerUrl + encodeURIComponent(url) +
  "&name=" + encodeURIComponent(name)
;

const pdfMimeTypes = [
  "application/pdf",
  "application/x-pdf",
  "application/x-bzpdf",
  "application/x-gzpdf",
];

// Add in the global message listener table a weak reference to the given
//  Message object. The monkey-patch which intercepts the "remote content
//  blocked" notification will then look for a suitable listener and notify it
//  of the aforementioned event.
function addMsgListener(aMessage) {
  let window = topMail3Pane(aMessage);
  let weakPtr = Cu.getWeakReference(aMessage);
  let msgListeners = window.Conversations.msgListeners;
  let messageId = aMessage._msgHdr.messageId;
  if (!(messageId in msgListeners))
    msgListeners[messageId] = [];
  msgListeners[messageId].push(weakPtr);
}


function dateAccordingToPref(date) {
  try {
    return Prefs.no_friendly_date ? dateAsInMessageList(date) : makeFriendlyDateAgo(date);
  } catch (e) {
    return dateAsInMessageList(date);
  }
}

class _MessageUtils {
  previewAttachment(win, name, url, isPdf, maybeViewable) {
    if (maybeViewable) {
      win.document.getElementById("tabmail").openTab(
        "contentTab",
        { contentPage: url }
      );
    }
    if (isPdf) {
      win.document.getElementById("tabmail").openTab(
        "chromeTab", { chromePage: makeViewerUrl(name, url) }
      );
    }
  }

  _getAttachmentInfo(win, msgUri, attachment) {
    const attInfo = new win.AttachmentInfo(
      attachment.contentType, attachment.url, attachment.name,
      msgUri, attachment.isExternal
    );
    attInfo.size = attachment.size;
    if (attInfo.size != -1) {
      attInfo.sizeResolved = true;
    }
    return attInfo;
  }

  downloadAllAttachments(win, msgUri, attachments) {
    win.HandleMultipleAttachments(attachments.map(att =>
      this._getAttachmentInfo(win, msgUri, att)), "save");
  }

  downloadAttachment(win, msgUri, attachment) {
    this._getAttachmentInfo(win, msgUri, attachment).save();
  }

  openAttachment(win, msgUri, attachment) {
    this._getAttachmentInfo(win, msgUri, attachment).open();
  }

  _compose(win, compType, msgUri, shiftKey) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    if (shiftKey) {
      win.ComposeMessage(compType, Ci.nsIMsgCompFormat.OppositeOfDefault, msgHdr.folder, [msgUri]);
    } else {
      win.ComposeMessage(compType, Ci.nsIMsgCompFormat.Default, msgHdr.folder, [msgUri]);
    }
  }

  editDraft(win, msgUri, shiftKey = false) {
    this._compose(win, Ci.nsIMsgCompType.Draft, msgUri, shiftKey);
  }

  editAsNew(win, msgUri, shiftKey = false) {
    this._compose(win, Ci.nsIMsgCompType.Template, msgUri, shiftKey);
  }

  reply(win, msgUri, shiftKey = false) {
    this._compose(win, Ci.nsIMsgCompType.ReplyToSender, msgUri, shiftKey);
  }

  replyAll(win, msgUri, shiftKey = false) {
    this._compose(win, Ci.nsIMsgCompType.ReplyAll, msgUri, shiftKey);
  }

  replyList(win, msgUri, shiftKey = false) {
    this._compose(win, Ci.nsIMsgCompType.ReplyToList, msgUri, shiftKey);
  }

  forward(win, msgUri, shiftKey = false) {
    let forwardType = 0;
    try {
      forwardType = Prefs.getInt("mail.forward_message_mode");
    } catch (e) {
      Log.error("Unable to fetch preferred forward mode\n");
    }
    if (forwardType == 0)
      this._compose(win, Ci.nsIMsgCompType.ForwardAsAttachment, msgUri, shiftKey);
    else
      this._compose(win, Ci.nsIMsgCompType.ForwardInline, msgUri, shiftKey);
  }

  archive(msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    msgHdrsArchive([msgHdr]);
  }

  delete(msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    msgHdrsDelete([msgHdr]);
  }

  ignorePhishing(msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    msgHdr.setUint32Property("notAPhishMessage", 1);
    // Force a commit of the underlying msgDatabase.
    msgHdr.folder.msgDatabase = null;
  }

  openInClassic(win, msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    const tabmail = win.document.getElementById("tabmail");
    tabmail.openTab("message", { msgHdr, background: false });
  }

  openInSourceView(win, msgUri) {
    win.ViewPageSource([msgUri]);
  }

  setTags(msgUri, tags) {
    msgHdrSetTags(msgUriToMsgHdr(msgUri),
      tags.map(tag => {
        return {
          key: tag.id,
        };
      })
    );
  }

  setStar(msgUri, star) {
    msgUriToMsgHdr(msgUri).markFlagged(star);
  }

  getMsgHdrDetails(win, msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    msgHdrGetHeaders(msgHdr, (headers) => {
      try {
        let extraLines = [{
          key: strings.get("header-folder"),
          value: sanitize(folderName(msgHdr.folder)[1]),
        }];
        let interestingHeaders =
          ["mailed-by", "x-mailer", "mailer", "date", "user-agent", "reply-to"];
        for (let h of interestingHeaders) {
          if (headers.has(h)) {
            let key = h;
            try { // Note all the header names are translated.
              key = strings.get("header-" + h);
            } catch (e) {}
            extraLines.push({
              key,
              value: sanitize(headers.get(h)),
            });
          }
        }
        let subject = headers.get("subject");
        extraLines.push({
          key: strings.get("header-subject"),
          value: subject ? sanitize(GlodaUtils.deMime(subject)) : "",
        });

        win.conversationDispatch({
          type: "MSG_HDR_DETAILS",
          extraLines,
          msgUri,
        });
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    });
  }
}

var MessageUtils = new _MessageUtils();

function KeyListener(aMessage) {
  this.message = aMessage;
  this.mail3PaneWindow = topMail3Pane(aMessage);
  this.KeyEvent = this.mail3PaneWindow.KeyEvent;
  this.navigator = this.mail3PaneWindow.navigator;
}

KeyListener.prototype = {
  functions: {
    doNothing: function doNothing(event) {
      event.preventDefault();
      event.stopPropagation();
    },
    toggleMessage: function toggleMessage(event) {
      // If we expand a collapsed, when in doubt, mark it read.
      if (this.message.collapsed)
        this.message.read = true;
      this.message.toggle();
      event.preventDefault();
      event.stopPropagation();
    },
    nextMessage: function nextMessage(event) {
      let [msgNodes, index] = this.findMsgNode(this.message._domNode);
      if (index < (msgNodes.length - 1)) {
        let next = msgNodes[index + 1];
        next.focus();
        // this.message._conversation._htmlPane.scrollNodeIntoView(next);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    prevMessage: function prevMessage(event) {
      let [msgNodes, index] = this.findMsgNode(this.message._domNode);
      if (index > 0) {
        let prev = msgNodes[index - 1];
        prev.focus();
        // this.message._conversation._htmlPane.scrollNodeIntoView(prev);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    reply: function reply(event) {
      if (event.shiftKey) {
        this.message.compose(Ci.nsIMsgCompType.ReplyAll);
      } else {
        this.message.compose(Ci.nsIMsgCompType.ReplyToSender);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    forward: function forward(event) {
      this.message.forward(event);
      event.preventDefault();
      event.stopPropagation();
    },
    setFocus: function setFocus(event) {
      // Hey, let's move back to this message next time!
      this.message._domNode.setAttribute("tabindex", "1");
      this.mail3PaneWindow.SetFocusThreadPane(event);
      event.preventDefault();
      event.stopPropagation();
    },
    viewSource: function viewSource(event) {
      topMail3Pane(this.message).ViewPageSource([this.message._uri]);
      event.preventDefault();
      event.stopPropagation();
    },
    archive: function archive(event) {
      msgHdrsArchive(this.message._conversation.msgHdrs);
      event.preventDefault();
      event.stopPropagation();
    },
    composeTemplate: function composeTemplate(event) {
      this.message.compose(Ci.nsIMsgCompType.Template);
      event.preventDefault();
      event.stopPropagation();
    },
    deleteMessage: function deleteMessage(event) {
      // TODO: This should use MessageUtils.delete().
      // this.message.removeFromConversation();
      event.preventDefault();
      event.stopPropagation();
    },
    tagHandling: function tagHandling(event) {
      // Tag handling.
      // 0 removes all tags, 1 to 9 set the corresponding tag, if it exists
      let i = event.which - "1".charCodeAt(0);
      if (i == -1) {
        this.message.tags = [];
      } else {
        let tag = MailServices.tags.getAllTags({})[i];
        if (tag) {
          if (this.message.tags.some(x => x.key == tag.key))
            this.message.tags = this.message.tags
            .filter(x => x.key != tag.key);
          else
            this.message.tags = this.message.tags.concat([tag]);
        }
      }
      event.preventDefault();
      event.stopPropagation();
    },
  },

  findMsgNode: function findMsgNode(msgNode) {
    let msgNodes = this.message._domNode.ownerDocument
      .getElementsByClassName(Message.prototype.cssClass);
    msgNodes = Array.from(msgNodes);
    let index = msgNodes.indexOf(msgNode);
    return [msgNodes, index];
  },

  saveKeybindings() {
    Prefs.setString("conversations.keybindings", JSON.stringify(KeyListener.prototype.keybindings));
  },
  loadKeybindings() {
    if (Prefs.hasPref("conversations.keybindings"))
      for (let [os, bindings] of entries(JSON.parse(Prefs.getString("conversations.keybindings"))))
        KeyListener.prototype.keybindings[os] = bindings;
  },
  restoreKeybindings() {
    // We need to preserve object identity for KeyListener.prototype.keybindings,
    // So we can't just clone defaultKeybindings directly.  Instead, we clone
    // each key/value pair, but leave the outer object unchanged.
    for (let [os, bindings] of entries(KeyListener.prototype.defaultKeybindings))
      KeyListener.prototype.keybindings[os] = JSON.parse(JSON.stringify(bindings));
  },
  defaultKeybindings: null, // To be filled in below with a copy of these keybindings
  keybindings: {
    "OSX": {
      "R": [{ mods: { metaKey: true, ctrlKey: false },
              func: "reply" },
            { mods: { metaKey: false, ctrlKey: true },
              func: "reply"}],
      "L": [{ mods: { metaKey: true, ctrlKey: false },
              func: "forward" },
            { mods: { metaKey: false, ctrlKey: true },
              func: "forward" }],
      "U": [{ mods: { metaKey: true, ctrlKey: false },
              func: "viewSource" },
            { mods: { metaKey: false, ctrlKey: true },
              func: "viewSource" }],
      "E": [{ mods: { metaKey: true, ctrlKey: false },
              func: "composeTemplate" },
            { mods: { metaKey: false, ctrlKey: true },
              func: "composeTemplate" }],
    },
    "Other": {
      "R": [{ mods: { ctrlKey: true },
              func: "reply"}],
      "L": [{ mods: { ctrlKey: true },
              func: "forward" }],
      "U": [{ mods: { ctrlKey: true },
              func: "viewSource" }],
      "E": [{ mods: { ctrlKey: true },
              func: "composeTemplate" }],
    },
    "Generic": {
      "\x0D": // \x0D = 13 = KeyboardEvent.DOM_VK_RETURN
        [{ mods: { metaKey: false, ctrlKey: false },
           func: "toggleMessage" }],
      "O": [{ mods: { metaKey: false, ctrlKey: false },
              func: "toggleMessage" }],
      "F": [{ mods: { metaKey: false, ctrlKey: false },
              func: "nextMessage" }],
      "B": [{ mods: { metaKey: false, ctrlKey: false },
              func: "prevMessage" }],
      "A": [{ mods: { metaKey: false, ctrlKey: false },
              func: "archive" }],
      "U": [{ mods: { metaKey: false, ctrlKey: false },
              func: "setFocus" }],
      "\x2E": // \x2E = 46 = KeyboardEvent.DOM_VK_DELETE
        [{ mods: { metaKey: false, ctrlKey: false },
           func: "deleteMessage" }],

      "0": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "1": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "2": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "3": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "4": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "5": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "6": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "7": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "8": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
      "9": [{ mods: { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
              func: "tagHandling" }],
    },
  },
  // Any event that's handled *must* be stopped from bubbling upwards, because
  //  there's a topmost event listener on the DOM window that re-fires any
  //  keypress (that one is not capturing) into the main window. We have to do
  //  this because otherwise events dont make it out of the <browser
  //  id="multimessage"> that holds us when the conversation view has focus.
  // That's what makes cmd/ctrl-n work properly.
  onKeyUp: function _KeyListener_onKeyPress(event) {
    let bindings;
    if (isOSX) {
      bindings = [this.keybindings.OSX, this.keybindings.Generic];
    } else { // TODO: Windows, Linux or other platform-specific bindings, rather than just "Other"?
      bindings = [this.keybindings.Other, this.keybindings.Generic];
    }
    let key = String.fromCharCode(event.which);
    for (let binding of bindings) {
      if (key in binding) {
        let actions = binding[key];
        for (let action of actions) {
          let match = true;
          for (let mod in action.mods) {
            // eslint-disable-next-line no-prototype-builtins
            if (action.mods.hasOwnProperty(mod)) {
              match = match && (action.mods[mod] == event[mod]);
            }
          }
          if (match) {
            let func = this.functions[action.func];
            if (typeof func === "function")
              func.call(this, event);
            return;
          }
        }
      }
    }
  },
};

const ConversationKeybindings = {
  bindings: KeyListener.prototype.keybindings,
  registerCustomListener: function registerCustomListener(name, func) {
    if (this.availableActions.includes(name))
      return false;
    this.availableActions.push(name);
    KeyListener.prototype.functions[name] = func;
    return true;
  },
  availableActions: [],
  saveKeybindings() { KeyListener.prototype.saveKeybindings(); },
  restoreKeybindings() { KeyListener.prototype.restoreKeybindings(); },
};

// Copy default bindings
KeyListener.prototype.defaultKeybindings = JSON.parse(JSON.stringify(KeyListener.prototype.keybindings));
// Load any customizations
KeyListener.prototype.loadKeybindings();
for (let [actionName /* j */] of entries(KeyListener.prototype.functions)) {
  ConversationKeybindings.availableActions.push(actionName);
}

// Call that one after setting this._msgHdr;
function Message(aConversation) {
  this._domNode = null;
  this._snippet = "";
  this._conversation = aConversation;

  this._date = dateAccordingToPref(new Date(this._msgHdr.date / 1000));
  // This one is for display purposes. We should always parse the non-decoded
  // author because there's more information in the encoded form (see #602)
  this._from = this.parse(this._msgHdr.author)[0];
  // Might be filled to something more meaningful later, in case we replace the
  //  sender with something more relevant, like X-Bugzilla-Who.
  this._realFrom = "";
  // The extra test is because recipients fallsback to cc if there's no To:
  // header, and we don't want to display the information twice, then.
  this._to = (this._msgHdr.recipients != this._msgHdr.ccList)
    ? this.parse(this._msgHdr.recipients)
    : [];
  this._cc = this._msgHdr.ccList.length ? this.parse(this._msgHdr.ccList) : [];
  this._bcc = this._msgHdr.bccList.length ? this.parse(this._msgHdr.bccList) : [];
  this.subject = this._msgHdr.mime2DecodedSubject;

  this._uri = msgHdrGetUri(this._msgHdr);
  this._contacts = [];
  this._attachments = [];
  this.contentType = "";
  this.hasRemoteContent = false;
  this.isPhishing = false;

  // A list of email addresses
  this.mailingLists = [];
  this.isReplyListEnabled = null;
  this.isReplyAllEnabled = null;
  this.isEncrypted = false;
  this.bugzillaInfos = {};

  // Filled by the conversation, useful to know whether we were initially the
  //  first message in the conversation or not...
  this.initialPosition = -1;

  // Selected state for onSelected function
  this._selected = false;
}

Message.prototype = {
  cssClass: "message",

  // Wraps the low-level header parser stuff.
  //  @param aMimeLine a line that looks like "John <john@cheese.com>, Jane <jane@wine.com>"
  //  @return a list of { email, name } objects
  parse(aMimeLine) {
    return parseMimeLine(aMimeLine);
  },

  RE_BZ_COMMENT: /^--- Comment #\d+ from .* \d{4}.*? ---([\s\S]*)/m,
  RE_MSGKEY: /number=(\d+)/,

  // This function is called before toTmplData, and allows us to adjust our
  // template data according to the message that came before us.
  updateTmplData(aPrevMsg) {
    let oldInfos = aPrevMsg && aPrevMsg.bugzillaInfos;
    if (!oldInfos)
      oldInfos = {};
    let infos = this.bugzillaInfos;
    let makeArrow = function(oldValue, newValue) {
      if (oldValue) {
        return oldValue + " \u21d2 " + newValue;
      }

      return newValue;
    };
    if (Object.keys(infos).length) {
      let items = [];
      for (let k of ["product", "component", "keywords", "severity",
          "status", "priority", "assigned-to", "target-milestone"]) {
        if ((!aPrevMsg || k in oldInfos) && oldInfos[k] != infos[k]) {
          let key =
            k.split("-").map(x => x.charAt(0).toUpperCase() + x.slice(1))
            .join(" ");
          items.push(key + ": " + makeArrow(oldInfos[k], infos[k]));
        }
      }
      if (infos["changed-fields"] && infos["changed-fields"].trim().length)
        items.push("Changed: " + infos["changed-fields"]);
      let m = this._snippet.match(this.RE_BZ_COMMENT);
      if (m && m.length && m[1].trim().length)
        items.push(m[1]);
      if (!items.length)
        items.push(this._snippet);

      this._snippet = items.join("; ");
    }
  },

  toReactData() {
    // Ok, brace ourselves for notifications happening during the message load
    //  process.
    addMsgListener(this);

    let msgData = this.toTmplData();
    return {
      attachments: msgData.attachments,
      attachmentsPlural: msgData.attachmentsPlural,
      bcc: msgData.dataContactsBcc,
      cc: msgData.dataContactsCc,
      date: msgData.date,
      folderName: msgData.folderName,
      from: msgData.dataContactFrom,
      fullDate: msgData.fullDate,
      gallery: msgData.gallery,
      hasRemoteContent: msgData.hasRemoteContent,
      isDraft: msgData.isDraft,
      isJunk: msgData.isJunk,
      isOutbox: msgData.isOutbox,
      isPhishing: msgData.isPhishing,
      msgUri: msgData.uri,
      multipleRecipients: msgData.multipleRecipients,
      neckoUrl: msgData.neckoUrl,
      read: msgData.read,
      realFrom: msgData.realFrom,
      recipientsIncludeLists: msgData.recipientsIncludeLists,
      shortFolderName: msgData.shortFolderName,
      snippet: msgData.snippet,
      starred: msgData.starred,
      tags: msgData.tags,
      to: msgData.dataContactsTo,
    };
  },

  // Output this message as a whole bunch of HTML
  toTmplData() {
    let self = this;
    let extraClasses = [];
    let data = {
      dataContactFrom: null,
      dataContactsTo: null,
      snippet: null,
      date: null,
      fullDate: null,
      attachmentsPlural: null,
      attachments: [],
      folderName: null,
      shortFolderName: null,
      gallery: false,
      hasRemoteContent: this.hasRemoteContent,
      isPhishing: this.isPhishing,
      uri: null,
      neckoUrl: msgHdrToNeckoURL(this._msgHdr),
      bugzillaUrl: "[unknown bugzilla instance]",
      extraClasses: null,
      isJunk: msgHdrIsJunk(this._msgHdr),
      isOutbox: false,
      generateLightningTempl: false,
      multipleRecipients: this.isReplyAllEnabled,
      recipientsIncludeLists: this.isReplyListEnabled,
      isDraft: false,
      starred: this._msgHdr.isFlagged,
      read: this.read,
    };

    // 1) Generate Contact objects
    let contactFrom = [
      this._conversation._contactManager
        .getContactFromNameAndEmail(this._from.name, this._from.email),
      this._from.email,
    ];
    this._contacts.push(contactFrom);
    // true means "with colors"
    data.dataContactFrom = contactFrom[0].toTmplData(true, Contacts.kFrom, contactFrom[1]);
    data.dataContactFrom.separator = "";

    function getContactsFrom(detail) {
      let contacts = detail.map(x =>
        [self._conversation._contactManager
          .getContactFromNameAndEmail(x.name, x.email),
         x.email]
      );
      self._contacts = self._contacts.concat(contacts);
      // false means "no colors"
      return contacts.map(([x, email]) => x.toTmplData(false, Contacts.kTo, email));
    }

    data.dataContactsTo = getContactsFrom(this._to);
    data.dataContactsCc = getContactsFrom(this._cc);
    data.dataContactsBcc = getContactsFrom(this._bcc);

    // 1b) Don't show "to me" if this is a bugzilla email
    if (Object.keys(this.bugzillaInfos).length) {
      extraClasses.push("bugzilla");
      try {
        let url = this.bugzillaInfos.url;
        data.bugzillaUrl = url;
      } catch (e) {
        if (e.result != Cr.NS_ERROR_MALFORMED_URI) {
          throw e;
        }
        // why not?
      }
    }

    // 2) Generate Attachment objects
    data = this.toTmplDataForAttachments(data);

    // 3) Generate extra information: snippet, date, uri
    data.snippet = sanitize(this._snippet);
    data.date = sanitize(this._date);
    data.fullDate = Prefs.no_friendly_date
      ? ""
      : dateAsInMessageList(new Date(this._msgHdr.date / 1000))
    ;
    data.uri = sanitize(this._uri);

    // 4) Custom tag telling the user if the message is not in the current view
    let [name, fullName] = folderName(this._msgHdr.folder);
    data.folderName = sanitize(fullName);
    data.shortFolderName = sanitize(name);

    // 5) Custom tag telling the user if this is a draft
    if (msgHdrIsDraft(this._msgHdr)) {
      data.isDraft = true;
      extraClasses.push("draft");
    }

    // 6) For the "show remote content" thing
    data.realFrom = sanitize(this._realFrom.email || this._from.email);

    // 7) Extra classes we want to add to the message
    if (this.isEncrypted)
      extraClasses.push("decrypted");
    data.extraClasses = extraClasses.join(" ");
    if (this._msgHdr.folder.getFlag(Ci.nsMsgFolderFlags.Queue))
      data.isOutbox = true;

    const tags = msgHdrGetTags(this._msgHdr);
    data.tags = tags.map(tag => {
      return {
        color: tag.color,
        id: tag.key,
        name: tag.tag,
      };
    });

    // 8) Decide whether Lightning is installed and Lightning content should be generated
    data.generateLightningTempl = isLightningInstalled();
    return data;
  },

  // Generate Attachment objects
  toTmplDataForAttachments(data) {
    if (!data) {
      data = {
        attachmentsPlural: null,
        attachments: [],
        gallery: false,
        uri: msgHdrGetUri(this._msgHdr),
      };
    }
    let self = this;
    let l = this._attachments.length;
    let [makePlural ] = PluralForm.makeGetter(strings.get("pluralForm"));
    data.attachmentsPlural = makePlural(l, strings.get("attachments")).replace("#1", l);
    for (let i = 0; i < l; i++) {
      const att = this._attachments[i];
      // Special treatment for images
      let isImage = (att.contentType.indexOf("image/") === 0);
      if (isImage)
        data.gallery = true;
      let isPdf = pdfMimeTypes.includes(att.contentType);
      let key = self._msgHdr.messageKey;
      let url = att.url.replace(self.RE_MSGKEY, "number=" + key);
      let [thumb, imgClass] = isImage
        ? [url, "resize-me"]
        : ["chrome://conversations/skin/icons/" + iconForMimeType(att.contentType), "mime-icon"]
      ;

      // This is bug 630011, remove when fixed
      let formattedSize = strings.get("sizeUnknown");
      // -1 means size unknown
      if (att.size != -1)
        formattedSize = Services.mMessenger.formatFileSize(att.size);

      // We've got the right data, push it!
      data.attachments.push({
        size: att.size,
        contentType: att.contentType,
        formattedSize,
        thumb: sanitize(thumb),
        imgClass,
        isExternal: att.isExternal,
        name: sanitize(att.name),
        url: att.url,
        anchor: "msg" + self.initialPosition + "att" + i,
        /* Only advertise the preview for PDFs (images have the gallery view). */
        isPdf,
        maybeViewable: att.contentType.indexOf("image/") === 0 ||
          att.contentType.indexOf("text/") === 0,
      });
    }
    return data;
  },

  // Once the conversation has added us into the DOM, we're notified about it
  //  (aDomNode is us), and we can start registering event handlers and stuff
  onAddedToDom(aDomNode) {
    if (!aDomNode) {
      Log.error("onAddedToDom() && !aDomNode", this.from, this.to, this.subject);
    }

    this._domNode = aDomNode;

    let self = this;

    let keyListener = new KeyListener(this);
    this._domNode.addEventListener("keydown", function(event) {
      keyListener.onKeyUp(event);
    }); // über-important: don't capture

    // Register event handlers for onSelected.
    // Set useCapture: true for preventing this from being canceled
    // by stopPropagation. This should be always called.
    // Use focus event for shortcut keys 'F', 'B' and Tab.
    // When trying to click a link or a collapsed message, focus event
    // occurs before click. Update display by focus event has posibility
    // to cause click failure. So we use mousedown to cancel focus event.
    let mousedown = false;
    this._domNode.addEventListener("mousedown", function() {
      mousedown = true;
    }, true);
    this._domNode.addEventListener("blur", function() {
      mousedown = false;
    }, true);
    this._domNode.addEventListener("focus", function() {
      if (!mousedown)
        self.onSelected();
    }, true);
    this._domNode.addEventListener("click", function() {
      self.onSelected();
    }, true);
    // For the case when focused by mousedown but not clicked
    this._domNode.addEventListener("mousemove", function() {
      if (mousedown) {
        self.onSelected();
        mousedown = false;
      }
    }, true);
    this._domNode.addEventListener("dragstart", function() {
      self.onSelected();
    }, true);
  },

  notifiedRemoteContentAlready: false,

  // The global monkey-patch finds us through the weak pointer table and
  //  notifies us.
  onMsgHasRemoteContent() {
    if (this.notifiedRemoteContentAlready)
      return;
    this.notifiedRemoteContentAlready = true;
    this.hasRemoteContent = true;
    Log.debug("This message's remote content was blocked");

    const msgData = this.toReactData();
    // TODO: make getting the window less ugly.
    this._conversation._htmlPane.conversationDispatch({
      type: "MSG_UPDATE_DATA",
      msgData,
    });
  },

  // This function should be called whenever the message is selected
  // by focus, click, scrollNodeIntoView, etc.
  onSelected: function _Message_onSelected() {
    if (this._selected)
      return;

    // We run below code only for the first time after messages selected.
    Log.debug("A message is selected: " + this._uri);
    this._selected = true;
    for ( let { message } of this._conversation.messages) {
      if (message != this) {
        message._selected = false;
      }
    }

    try {
      for (let h of getHooks()) {
        if (typeof(h.onMessageSelected) == "function") {
          h.onMessageSelected(this);
        }
      }
    } catch (e) {
      Log.warn("Plugin returned an error:", e);
      dumpCallStack(e);
    }
  },

  // Actually, we only do these expensive DOM calls when we need to, i.e. when
  //  we're expanded for the first time (expand calls us).
  registerActions: function _Message_registerActions() {
    // Register all the needed event handlers. Nice wrappers below.

    // TODO: This toggle is currently disabled.
    // if (realFrom in Prefs.monospaced_senders)
    //   this._domNode.getElementsByClassName("checkbox-monospace")[0].checked = true;

    // This one is located in the first contact tooltip
    // this.register(".checkbox-monospace", function(event) {
    //   let senders = Object.keys(Prefs.monospaced_senders);
    //   senders = senders.filter(x => x != realFrom);
    //   if (event.target.checked) {
    //     Prefs.setChar("conversations.monospaced_senders", senders.concat([realFrom]).join(","));
    //   } else {
    //     Prefs.setChar("conversations.monospaced_senders", senders.join(","));
    //   }
    //   self._reloadMessage();
    //   event.stopPropagation();
    // });
  },

  get iframe() {
    return this._domNode.getElementsByTagName("iframe")[0];
  },

  // Convenience properties
  get read() {
    return this._msgHdr.isRead;
  },

  set read(v) {
    msgHdrsMarkAsRead([this._msgHdr], v);
  },

  get tags() {
    return msgHdrGetTags(this._msgHdr);
  },

  set tags(v) {
    msgHdrSetTags(this._msgHdr, v);
  },

  _signal() {
    this._conversation._signal();
  },

  streamMessage(msgWindow, docshell) {
    // Pre msg loading.
    for (let h of getHooks()) {
      try {
        if (typeof(h.onMessageBeforeStreaming) == "function")
          h.onMessageBeforeStreaming(this);
      } catch (e) {
        Log.warn("Plugin returned an error:", e);
        dumpCallStack(e);
      }
    }

    addMsgListener(this);

    const neckoUrl = msgHdrToNeckoURL(this._msgHdr).spec;

    const messageService = Services.mMessenger.messageServiceFromURI(neckoUrl);
    messageService.DisplayMessage(this._uri + "&markRead=false", docshell,
                                  msgWindow, undefined, undefined, {});
  },

  postStreamMessage(msgWindow, iframe) {
    // Notify hooks that we just finished displaying a message. Must be
    //  performed now, not later. This gives plugins a chance to modify
    //  the DOM of the message (i.e. decrypt it) before we tweak the
    //  fonts and stuff.
    for (let h of getHooks()) {
      try {
        if (typeof(h.onMessageStreamed) == "function")
          h.onMessageStreamed(this._msgHdr, iframe, msgWindow, this);
      } catch (e) {
        Log.warn("Plugin returned an error:", e);
        dumpCallStack(e);
      }
    }

    Services.tm.dispatchToMainThread(() => {
      this._checkForPhishing(iframe);
    });
    // signal! ?
  },

  _checkForPhishing(iframe) {
    if (!Prefs.getBool("mail.phishing.detection.enabled")) {
      return;
    }

    if (this._msgHdr.getUint32Property("notAPhishMessage")) {
      return;
    }

    // If the message contains forms with action attributes, warn the user.
    let formNodes = iframe.contentWindow.document
      .querySelectorAll("form[action]");

    const url =
      Services.io.newURI(this._uri).QueryInterface(Ci.nsIMsgMailNewsUrl);

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
      Prefs.getBool("mail.phishing.detection.disallow_form_actions") &&
      formNodes.length > 0
    ) {
      this.isPhishing = true;
      const msgData = this.toReactData();
      // TODO: make getting the window less ugly.
      this._conversation._htmlPane.conversationDispatch({
        type: "MSG_UPDATE_DATA",
        msgData,
      });
    }
  },

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
    let prepare = function(aNode) {
      let node = aNode.cloneNode(true);
      for (let x of node.getElementsByClassName("moz-txt-sig"))
        if (x)
          x.remove();
      for (let x of node.querySelectorAll("blockquote, div"))
        if (x && x.style.display == "none")
          x.remove();
      return node.innerHTML;
    };
    let body = htmlToPlainText(prepare(this.iframe.contentWindow.document.body));
    // Remove trailing newlines, it gives a bad appearance.
    body = body.replace(/[\n\r]*$/, "");
    return body;
  },

  /**
   * Fills the bodyContainer <div> with the plaintext contents of the message
   * for printing.
   */
  dumpPlainTextForPrinting: function _Message_dumpPlainTextForPrinting() {
    // printConversation from content/stub.xhtml calls us, regardless of whether
    // we've streamed the message yet, or not, so the iframe might not be ready
    // yet. That's ok, since we will print the snippet anyway.
    if (this.iframe) {
      // Fill the text node that will end up being printed. We can't
      // really print iframes, they don't wrap...
      let bodyContainer = this._domNode.getElementsByClassName("body-container")[0];
      bodyContainer.textContent = this.bodyAsText;
    }
  },

  /**
   * This function is called for the "Forward conversation" action. The idea is
   * that we want to forward a plaintext version of the message, so we try and
   * do our best to give this. We're trying not to stream it once more!
   */
  exportAsHtml: function _Message_exportAsHtml(k) {
    let author = escapeHtml(this._contacts[0][0]._name);
    let authorEmail = this._from.email;
    let authorAvatar = this._contacts[0][0].avatar;
    let authorColor = this._contacts[0][0].color;
    let date = dateAccordingToPref(new Date(this._msgHdr.date / 1000));
    // We try to convert the bodies to plain text, to enhance the readability in
    // the forwarded conversation. Note: <pre> tags are not converted properly
    // it seems, need to investigate...
    quoteMsgHdr(this._msgHdr, function(body) {
      // UGLY HACK. I don't even wanna dig into the internals of the composition
      // window to figure out why this results in an extra <br> being added, so
      // let's just stay sane and use a hack.
      body = body.replace(/\r?\n<br>/g, "<br>");
      body = body.replace(/<br>\r?\n/g, "<br>");
      if (!(body.indexOf("<pre wrap>") === 0))
        body = "<br>" + body;
      let html = [
        '<div style="overflow: auto">',
        '<img src="', authorAvatar, '" style="float: left; height: 48px; margin-right: 5px" />',
        '<b><span><a style="color: ', authorColor, ' !important; text-decoration: none !important; font-weight: bold" href="mailto:', authorEmail,
        '">', author, "</a></span></b><br />",
        '<span style="color: #666">', date, "</span>",
        "</div>",
        '<div style="color: #666">',
          body,
        "</div>",
      ].join("");
      k(html);
    });
  },
};

function MessageFromGloda(aConversation, aGlodaMsg, aLateAttachments) {
  this._msgHdr = aGlodaMsg.folderMessage;
  this._glodaMsg = aGlodaMsg;
  this.needsLateAttachments = aLateAttachments;
  Message.apply(this, arguments);

  // Our gloda plugin found something for us, thanks dude!
  if (aGlodaMsg.alternativeSender) {
    this._realFrom = this._from;
    this._from = this.parse(aGlodaMsg.alternativeSender)[0];
  }

  if (aGlodaMsg.bugzillaInfos)
    this.bugzillaInfos = JSON.parse(aGlodaMsg.bugzillaInfos);

  // FIXME messages that have no body end up with "..." as a snippet
  this._snippet = aGlodaMsg._indexedBodyText
    ? aGlodaMsg._indexedBodyText.substring(0, kSnippetLength - 1)
    : "..."; // it's probably an Enigmail message

  if ("attachmentInfos" in aGlodaMsg)
    this._attachments = aGlodaMsg.attachmentInfos;

  if ("contentType" in aGlodaMsg)
    this.contentType = aGlodaMsg.contentType;
  else
    this.contentType = "message/rfc822";

  if ("isEncrypted" in aGlodaMsg)
    this.isEncrypted = aGlodaMsg.isEncrypted;

  if ((aGlodaMsg.contentType + "").search(/^multipart\/encrypted(;|$)/i) == 0)
    this.isEncrypted = true;

  if ("mailingLists" in aGlodaMsg)
    this.mailingLists = aGlodaMsg.mailingLists.map(x => x.value);

  this.isReplyListEnabled =
    ("mailingLists" in aGlodaMsg) && aGlodaMsg.mailingLists.length;
  let seen = {};
  this.isReplyAllEnabled =
    [aGlodaMsg.from].concat(aGlodaMsg.to).concat(aGlodaMsg.cc).concat(aGlodaMsg.bcc)
    .filter(function(x) {
      let r = !(getIdentityForEmail(x.value)) && !(x.value in seen);
      seen[x.value] = null;
      return r;
    }).length > 1;

  this._signal();
}

MessageFromGloda.prototype = {
  __proto__: Message.prototype,
};

function MessageFromDbHdr(aConversation, aMsgHdr) {
  this._msgHdr = aMsgHdr;
  Message.apply(this, arguments);

  // Gloda is not with us, so stream the message... the MimeMsg API says that
  //  the streaming will fail and the underlying exception will be re-thrown in
  //  case the message is not on disk. In that case, the fallback is to just get
  //  the body text and wait for it to be ready. This can be SLOW (like, real
  //  slow). But at least it works. (Setting the fourth parameter to true just
  //  leads to an empty snippet).
  let self = this;
  Log.warn("Streaming the message because Gloda has not indexed it, this is BAD");
  try {
    MsgHdrToMimeMessage(aMsgHdr, null, function(aMsgHdr, aMimeMsg) {
      try {
        if (aMimeMsg == null) {
          self._fallbackSnippet();
          return;
        }

        let [text /* meta */] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, kSnippetLength);
        self._snippet = text;
        let alternativeSender = PluginHelpers.alternativeSender({ mime: aMimeMsg, header: aMsgHdr });
        if (alternativeSender) {
          self._realFrom = self._from;
          self._from = self.parse(alternativeSender)[0];
        }

        self.bugzillaInfos = PluginHelpers.bugzilla({ mime: aMimeMsg, header: aMsgHdr }) || {};

        self._attachments = aMimeMsg.allUserAttachments
          .filter(x => x.isRealAttachment);
        self.contentType = aMimeMsg.headers["content-type"] || "message/rfc822";
        let listPost = aMimeMsg.get("list-post");
        if (listPost) {
          let r = listPost.match(self.RE_LIST_POST);
          if (r && r.length)
            self.mailingLists = [r[1]];
        }
        Log.debug(self.mailingLists);

        self.isReplyListEnabled =
          aMimeMsg &&
          aMimeMsg.has("list-post") &&
          self.RE_LIST_POST.exec(aMimeMsg.get("list-post"))
        ;
        let seen = {};
        self.isReplyAllEnabled =
          parseMimeLine(aMimeMsg.get("from"), true)
          .concat(parseMimeLine(aMimeMsg.get("to"), true))
          .concat(parseMimeLine(aMimeMsg.get("cc"), true))
          .concat(parseMimeLine(aMimeMsg.get("bcc"), true))
          .filter(function(x) {
            let r = !(getIdentityForEmail(x.email)) && !(x.email in seen);
            seen[x.email] = null;
            return r;
          })
          .length > 1;

        let findIsEncrypted = x =>
          x.isEncrypted || (x.parts ? x.parts.some(findIsEncrypted) : false);
        self.isEncrypted = findIsEncrypted(aMimeMsg);

        self._signal();
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, true, {
      partsOnDemand: true,
      examineEncryptedParts: true,
    });
  } catch (e) {
    // Remember: these exceptions don't make it out of the callback (XPConnect
    // death trap, can't fight it until we reach level 3 and gain 1200 exp
    // points, so keep training)
    Log.warn("Gloda failed to stream the message properly, this is VERY BAD");
    Log.warn(e);
    this._fallbackSnippet();
  }
}

MessageFromDbHdr.prototype = {
  __proto__: Message.prototype,

  _fallbackSnippet: function _MessageFromDbHdr_fallbackSnippet() {
    Log.debug("Using the default streaming code...");
    let body = msgHdrToMessageBody(this._msgHdr, true, kSnippetLength);
    Log.debug("Body is", body);
    this._snippet = body.substring(0, kSnippetLength - 1);
    this._signal();
  },

  RE_LIST_POST: /<mailto:([^>]+)>/,
};
