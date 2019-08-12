/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = [
  "Message", "MessageFromGloda", "MessageFromDbHdr",
  "ConversationKeybindings", "MessageUtils", "watchIFrame",
];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  GlodaUtils: "resource:///modules/gloda/utils.js",
  isLightningInstalled: "resource://conversations/modules/plugins/lightning.js",
  isLegalIPAddress: "resource:///modules/hostnameUtils.jsm",
  isLegalLocalIPAddress: "resource:///modules/hostnameUtils.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  makeFriendlyDateAgo: "resource:///modules/templateUtils.js",
  MsgHdrToMimeMessage: "resource:///modules/gloda/mimemsg.js",
  mimeMsgToContentSnippetAndMeta: "resource:///modules/gloda/connotent.js",
  PluralForm: "resource://gre/modules/PluralForm.jsm",
  Services: "resource://gre/modules/Services.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});
const {
  dateAsInMessageList, entries, escapeHtml, getIdentityForEmail, isAccel,
  isOSX, isWindows, MixIn, parseMimeLine, sanitize,
} = ChromeUtils.import("resource://conversations/modules/stdlib/misc.js");

// It's not really nice to write into someone elses object but this is what the
// Services object is for.  We prefix with the "m" to ensure we stay out of their
// namespace.
XPCOMUtils.defineLazyGetter(Services, "mMessenger",
                            function() {
                              return Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
                            });

const kAllowRemoteContent = 2;

const kHeadersShowAll = 2;
// const kHeadersShowNormal = 1;

const olderThan52 = Services.vc.compare(Services.sysinfo.version, "51.1") > 0;

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
const {
  convertOutlookQuotingToBlockquote, convertHotmailQuotingToBlockquote1,
  convertForwardedToBlockquote, convertMiscQuotingToBlockquote,
  fusionBlockquotes,
} = ChromeUtils.import("resource://conversations/modules/quoting.js", {});
const {Contacts} = ChromeUtils.import("resource://conversations/modules/contact.js", {});
const {Prefs} = ChromeUtils.import("resource://conversations/modules/prefs.js", {});
const {EventHelperMixIn, folderName, iconForMimeType, topMail3Pane} =
  ChromeUtils.import("resource://conversations/modules/misc.js", {});
const {getHooks} = ChromeUtils.import("resource://conversations/modules/hook.js", {});
const {dumpCallStack, setupLogging, Colors} = ChromeUtils.import("resource://conversations/modules/log.js", {});

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

function tenPxFactor() {
  if (isOSX) {
    return .666;
  }
  return isWindows ? .7 : .625;
}

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
        this.message._conversation._htmlPane.scrollNodeIntoView(next);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    prevMessage: function prevMessage(event) {
      let [msgNodes, index] = this.findMsgNode(this.message._domNode);
      if (index > 0) {
        let prev = msgNodes[index - 1];
        prev.focus();
        this.message._conversation._htmlPane.scrollNodeIntoView(prev);
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
      this.message.removeFromConversation();
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
      this.message.onAttributesChanged(this.message);
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
  this._didStream = false;
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

  get inView() {
    return this._domNode.classList.contains("inView");
  },

  set inView(v) {
    if (v)
      this._domNode.classList.add("inView");
    else
      this._domNode.classList.remove("inView");
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

  // Output this message as a whole bunch of HTML
  toTmplData(aQuickReply) {
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
      uri: null,
      neckoUrl: msgHdrToNeckoURL(self._msgHdr),
      quickReply: aQuickReply,
      bugzillaUrl: "[unknown bugzilla instance]",
      extraClasses: null,
      canUnJunk: false,
      isOutbox: false,
      generateLightningTempl: false,
      multipleRecipients: this.isReplyAllEnabled,
      recipientsIncludeLists: this.isReplyListEnabled,
      isDraft: false,
      starred: this.starred,
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

    let to = this._to.concat(this._cc).concat(this._bcc);
    let contactsTo = to.map(x =>
      [self._conversation._contactManager
        .getContactFromNameAndEmail(x.name, x.email),
       x.email]
    );
    this._contacts = this._contacts.concat(contactsTo);
    // false means "no colors"
    data.dataContactsTo = contactsTo.map(([x, email]) => x.toTmplData(false, Contacts.kTo, email));
    let l = data.dataContactsTo.length;
    data.dataContactsTo.forEach(function(data, i) {
      if (i == 0)
        data.separator = "";
      else if (i < l - 1)
        data.separator = strings.get("sepComma");
      else
        data.separator = strings.get("sepAnd");
    });

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
    if (this._conversation.messages.length == 1 && msgHdrIsJunk(this._msgHdr))
      data.canUnJunk = true;
    if (this._msgHdr.folder.getFlag(Ci.nsMsgFolderFlags.Queue))
      data.isOutbox = true;

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

    // This allows us to pre-set the star and the tags in the right original
    //  state
    this._domNode = aDomNode;
    this.onAttributesChanged(this);

    let self = this;
    this._domNode.getElementsByClassName("messageHeader")[0]
      .addEventListener("click", function(event) {
        // Don't do any collapsing if we're clicking on one of the header buttons.
        if (event.target.localName == "button" ||
            event.target.className.includes("action-")) {
          return;
        }
        self._conversation._runOnceAfterNSignals(function() {
          if (self.expanded) {
            self._conversation._htmlPane.scrollNodeIntoView(self._domNode);
            if (Prefs.getBool("mailnews.mark_message_read.auto") ||
                Prefs.getBool("mailnews.mark_message_read.delay")) {
              self.read = true;
            }
          }
        }, 1);
        self.toggle();
      });

    let keyListener = new KeyListener(this);
    this._domNode.addEventListener("keydown", function(event) {
      keyListener.onKeyUp(event);
    }); // über-important: don't capture

    // // Do this now because the star is visible even if we haven't been expanded
    // // yet.
    // TODO: Move this across.
    // this.register(".star", function(event) {
    //   self.starred = !self.starred;
    //   // Don't trust gloda. Big hack, self also has the "starred" property, so
    //   //  we don't have to create a new object.
    //   self.onAttributesChanged(self);
    //   event.stopPropagation();
    // });

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
  onMsgHasRemoteContent: function _Message_onMsgHasRemoteContent() {
    if (this.notifiedRemoteContentAlready)
      return;
    this.notifiedRemoteContentAlready = true;
    Log.debug("This message's remote content was blocked");

    this._domNode.getElementsByClassName("remoteContent")[0].style.display = "block";
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
    let self = this;
    let mainWindow = topMail3Pane(this);

    // Let the UI do its stuff with the tooltips
    this._conversation._htmlPane.enableTooltips(this);

    // Register all the needed event handlers. Nice wrappers below.

    // Pre-set the right value
    // let realFrom = "";
    // if (this._from.email)
    //   realFrom = this._from.email.trim().toLowerCase();
    // // _realFrom is better.
    // if (this._realFrom.email)
    //   realFrom = this._realFrom.email.trim().toLowerCase();

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
    this.register(".tooltip", function(event) {
      // Clicking inside a tooltip must not collapse the message.
      event.stopPropagation();
    });

    this.register(".sendUnsent", function(event) {
      let w = topMail3Pane(self);
      if (Services.io.offline)
        w.MailOfflineMgr.goOnlineToSendMessages(w.msgWindow);
      else
        w.SendUnsentMessages();
    });

    this.register(".notJunk", function(event) {
      self._domNode.getElementsByClassName("junkBar")[0].style.display = "none";
      // false = not junk
      topMail3Pane(self).JunkSelectedMessages(false);
    });
    this.register(".ignore-warning", function(event) {
      self._domNode.getElementsByClassName("phishingBar")[0].style.display = "none";
      self._msgHdr.setUint32Property("notAPhishMessage", 1);
      // Force a commit of the underlying msgDatabase.
      self._msgHdr.folder.msgDatabase = null;
    });
    this.register(".show-remote-content", function(event) {
      self._domNode.getElementsByClassName("show-remote-content")[0].style.display = "none";
      self._msgHdr.setUint32Property("remoteContentPolicy", kAllowRemoteContent);
      self._msgHdr.folder.msgDatabase = null;
      self._reloadMessage();
    });
    this.register(".always-display", function(event) {
      self._domNode.getElementsByClassName("remoteContent")[0].style.display = "none";

      let chromeUrl;
      if (olderThan52) {
        chromeUrl = "chrome://messenger/content/?email=" + self._from.email;
      } else {
        chromeUrl = "chrome://messenger/content/email=" + self._from.email;
      }
      let uri = Services.io.newURI(chromeUrl);
      Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
      self._reloadMessage();
    });
    this.register(".messageBody .in-folder", function(event) {
      mainWindow.gFolderTreeView.selectFolder(self._msgHdr.folder, true);
      mainWindow.gFolderDisplay.selectMessage(self._msgHdr);
    });

    // We only output this shitload of contact nodes when we have to...
    this.register(".details > a", function(event) {
      event.stopPropagation();
      event.preventDefault();
      self.showDetails();
    });

    this.register(".hide-details > a", function(event) {
      event.stopPropagation();
      event.preventDefault();
      self._domNode.classList.remove("with-details");
    });

    let attachmentNodes = this._domNode.getElementsByClassName("attachment");
    /**
     * We now assume that all the information is correct. I've done enough work
     * on the Gloda side to ensure this. All hail to Gloda!
     */
    for (let i = 0; i < attachmentNodes.length; ++i) {
      let att = self._attachments[i];
      // TODO: Make messageAttachments not require this and handle it itself.
      // For the context menu event handlers
      attachmentNodes[i].attInfo =
        new mainWindow.AttachmentInfo(
          att.contentType, att.url, att.name, self._uri, att.isExternal, 42
        );
    }
    this.register(".quickReply", function(event) {
      event.stopPropagation();
    }, { action: "keyup" });
    this.register(".quickReply", function(event) {
      event.stopPropagation();
    }, { action: "keypress" });
    this.register(".quickReply", function(event) {
      // Ok, so it's actually convenient to register our event listener on the
      //  .quickReply node because we can easily prevent it from bubbling
      //  upwards, but the problem is, if a message is appended at the end of
      //  the conversation view, this event listener is active and the one from
      //  the new message is active too. So we check that the quick reply still
      //  is inside our dom node.
      if (!self._domNode.getElementsByClassName("quickReply").length)
        return;

      let window = self._conversation._htmlPane;

      switch (event.keyCode) {
        case mainWindow.KeyEvent.DOM_VK_RETURN:
          if (isAccel(event)) {
            if (event.shiftKey)
              window.gComposeSession.send({ archive: true });
            else
              window.gComposeSession.send();
          }
          break;

        case mainWindow.KeyEvent.DOM_VK_ESCAPE:
          Log.debug("Escape from quickReply");
          self._domNode.focus();
          break;
      }
      event.stopPropagation();
    }, { action: "keydown" });
  },

  _reloadMessage: function _Message_reloadMessage() {
    // The second one in for when we're expanded.
    let specialTags = this._domNode.getElementsByClassName("special-tags")[1];
    // Remove any extra tags because they will be re-added after reload, but
    //  leave the "show remote content" tag.
    for (let i = specialTags.children.length - 1; i >= 0; i--) {
      let child = specialTags.children[i];
      if (!child.classList.contains("keep-tag"))
        specialTags.removeChild(child);
    }
    this.iframe.remove();
    this.streamMessage();
  },

  get iframe() {
    return this._domNode.getElementsByTagName("iframe")[0];
  },

  // {
  //  starred: bool,
  //  tags: nsIMsgTag list,
  // } --> both Message and GlodaMessage implement these attributes
  onAttributesChanged: function _Message_onAttributesChanged({ starred, tags }) {
    // Update "starred" attribute
    if (starred)
      this._domNode.getElementsByClassName("star")[0].classList.add("starred");
    else
      this._domNode.getElementsByClassName("star")[0].classList.remove("starred");

    // Update tags
    let tagList = this._domNode.getElementsByClassName("regular-tags")[1];
    while (tagList.firstChild)
      tagList.firstChild.remove();
    for (let mtag of tags) {
      let tag = mtag;
      let document = this._domNode.ownerDocument;
      let rgb = MailServices.tags.getColorForKey(tag.key).substr(1) || "FFFFFF";
      // This is just so we can figure out if the tag color is too light and we
      // need to have the text black or not.
      let [, r, g, b] = rgb.match(/(..)(..)(..)/).map(x => parseInt(x, 16) / 255);
      let colorClass = "blc-" + rgb;
      let tagName = tag.tag;
      let tagNode = document.createElement("li");
      let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l > .8)
        tagNode.classList.add("light-tag");
      tagNode.classList.add("tag");
      tagNode.classList.add(colorClass);
      tagNode.appendChild(document.createTextNode(tagName));
      let span = document.createElement("span");
      span.textContent = " x";
      span.classList.add("tag-x");
      span.addEventListener("click", function(event) {
        let tags = this.tags.filter(x => x.key != tag.key);
        this.tags = tags;
        // And now let onAttributesChanged kick in... NOT
        tagList.removeChild(tagNode);
      }.bind(this));
      tagNode.appendChild(span);
      tagList.appendChild(tagNode);
    }
    let otherTagList = this._domNode.getElementsByClassName("regular-tags")[0];
    while (otherTagList.firstChild)
      otherTagList.firstChild.remove();
    for (let node of tagList.childNodes)
      otherTagList.appendChild(node.cloneNode(true));
  },

  removeFromConversation: function _Message_removeFromConversation() {
    this._conversation.removeMessage(this);
    msgHdrsDelete([this._msgHdr]);
    let w = this._conversation._window;
    if (this._conversation._htmlPane.isInTab
        && !this._conversation.messages.length)
      w.closeTab();
  },

  // Build attachment view if we have a `MessageFromGloda` that's encrypted
  // because Gloda has not indexed attachments.
  buildAttachmentViewIfNeeded(k) {
    if (!this.needsLateAttachments) {
      k();
      return;
    }
    let self = this;
    Log.debug(Colors.blue, "Building attachment view", Colors.default);
    try {
      MsgHdrToMimeMessage(this._msgHdr, null, function(aMsgHdr, aMimeMsg) {
        try {
          if (aMimeMsg == null)
            return;

          if (Prefs.extra_attachments) {
            self._attachments = aMimeMsg.allAttachments.concat(aMimeMsg.allUserAttachments);
            let hashMap = {};
            self._attachments = self._attachments.filter(function(x) {
              let seenAlready = (x.url in hashMap);
              hashMap[x.url] = null;
              return !seenAlready;
            });
          } else {
            self._attachments = aMimeMsg.allUserAttachments
              .filter(x => x.isRealAttachment);
          }

          try {
            k();
          } catch (e) {
            Log.error(e);
            dumpCallStack(e);
          }
        } catch (e) {
          Log.error(e);
          dumpCallStack(e);
          k();
        }
      }, true, {
        partsOnDemand: true,
        examineEncryptedParts: true,
      });
    } catch (e) {
      Log.warn("Failed to stream the attachments properly, this is VERY BAD");
      Log.warn(e);
      k();
    }
  },

  // Adds the details if needed... done after the message has been streamed, so
  // in theory, that should be pretty fast...
  showDetails: function _Message_showDetails(k) {
    // Hide all irrelevant UI items now we're showing details
    this._domNode.classList.add("with-details");
    if (this.detailsFetched)
      return;
    this.detailsFetched = true;
    let w = this._conversation._htmlPane;
    msgHdrGetHeaders(this._msgHdr, function(aHeaders) {
      try {
        let data = {
          dataContactsFrom: [],
          dataContactsTo: [],
          dataContactsCc: [],
          dataContactsBcc: [],
          extraLines: [],
        };
        data.extraLines.push({
          key: strings.get("header-folder"),
          value: sanitize(folderName(this._msgHdr.folder)[1]),
        });
        let interestingHeaders =
          ["mailed-by", "x-mailer", "mailer", "date", "user-agent", "reply-to"];
        for (let h of interestingHeaders) {
          if (aHeaders.has(h)) {
            let key = h;
            try { // Note all the header names are translated.
              key = strings.get("header-" + h);
            } catch (e) {}
            data.extraLines.push({
              key,
              value: sanitize(aHeaders.get(h)),
            });
          }
        }
        let subject = aHeaders.get("subject");
        data.extraLines.push({
          key: strings.get("header-subject"),
          value: subject ? sanitize(GlodaUtils.deMime(subject)) : "",
        });
        let self = this;
        let buildContactObjects = nameEmails =>
          nameEmails.map(x =>
            [self._conversation._contactManager
              .getContactFromNameAndEmail(x.name, x.email),
             x.email]
          );
        let buildContactData = contactObjects =>
          contactObjects.map(([x, email]) =>
            // Fourth parameter: aIsDetail
            x.toTmplData(false, Contacts.kTo, email, true)
          );
        let contactsFrom = buildContactObjects([this._from]);
        let contactsTo = buildContactObjects(this._to);
        let contactsCc = buildContactObjects(this._cc);
        let contactsBcc = buildContactObjects(this._bcc);
        data.dataContactsFrom = buildContactData(contactsFrom);
        data.dataContactsTo = buildContactData(contactsTo);
        data.dataContactsCc = buildContactData(contactsCc);
        data.dataContactsBcc = buildContactData(contactsBcc);

        // Output the template
        this._domNode.getElementsByClassName("detailsPlaceholder")[0].appendChild(w.tmpl("#detailsTemplate", data));
        // Activate tooltip event listeners
        w.enableTooltips(this);
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
      // It's asynchronous, so move on if needed.
      if (k)
        k();
    }.bind(this));
  },

  // Convenience properties
  get read() {
    return this._msgHdr.isRead;
  },

  set read(v) {
    msgHdrsMarkAsRead([this._msgHdr], v);
  },

  get starred() {
    return this._msgHdr.isFlagged;
  },

  set starred(v) {
    this._msgHdr.markFlagged(v);
  },

  get tags() {
    return msgHdrGetTags(this._msgHdr);
  },

  set tags(v) {
    msgHdrSetTags(this._msgHdr, v);
  },

  get collapsed() {
    return this._domNode.classList.contains("collapsed");
  },

  get expanded() {
    return !this.collapsed;
  },

  toggle() {
    if (this.collapsed)
      this.expand();
    else if (this.expanded)
      this.collapse();
    else
      Log.error("WTF???");
  },

  _signal: function _Message_signal() {
    this._conversation._signal();
  },

  expand() {
    this._domNode.classList.remove("collapsed");
    if (!this._didStream) {
      try {
        let self = this;
        this.buildAttachmentViewIfNeeded(function() {
          self.registerActions();
          self.streamMessage(); // will call _signal
        });
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    } else {
      this._signal();
    }
  },

  collapse() {
    this._domNode.classList.add("collapsed");
  },

  // This function takes care of streaming the message into the <iframe>, adding
  // it into the DOM tree, watching for completion, reloading if necessary
  // (BidiUI), applying the various heuristics for detecting quoted parts,
  // changing the monospace font for the default one, possibly decrypting the
  // message using Enigmail, making coffee...
  streamMessage() {
    Log.assert(this.expanded, "Cannot stream a message if not expanded first!");

    let originalScroll = this._domNode.ownerDocument.documentElement.scrollTop;
    let msgWindow = topMail3Pane(this).msgWindow;
    let self = this;

    for (let h of getHooks()) {
      try {
        if (typeof(h.onMessageBeforeStreaming) == "function")
          h.onMessageBeforeStreaming(this);
      } catch (e) {
        Log.warn("Plugin returned an error:", e);
        dumpCallStack(e);
      }
    }

    let iframe = this._domNode.ownerDocument
      .createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "iframe");
    iframe.setAttribute("style", "height: 20px; overflow-y: hidden");
    iframe.setAttribute("type", "content");

    // The xul:iframe automatically loads about:blank when it is added
    // into the tree. We need to wait for the document to be loaded before
    // doing things.
    //
    // Why do we do that? Basically because we want the <xul:iframe> to
    // have a docShell and a webNavigation. If we don't do that, and we
    // set directly src="about:blank" above, sometimes we are too fast and
    // the docShell isn't ready by the time we get there.
    iframe.addEventListener("load", function f_temp2(event, aCharset) {
      try {
        iframe.removeEventListener("load", f_temp2, true);

        // The post-display adjustments are now divided in two phases. Some
        // stuff takes place directly after the message has been streamed but
        // _before_ images have been loaded. We adjust the height after that.
        // But still need to do some more processing after the message has been
        // fully loaded. We adjust the height again.


        // Early adjustments
        iframe.addEventListener("DOMContentLoaded", function f_temp3(event) {
          let iframeDoc = iframe.contentDocument;
          self.tweakFonts(iframeDoc);
          if (!(self._realFrom && self._realFrom.email.indexOf("bugzilla-daemon") == 0))
            self.detectQuotes(iframe);
          self.detectSigs(iframe);
          self.registerLinkHandlers(iframe);
          self.injectCss(iframeDoc);

          // adjustHeight();
        }, {once: true});

        // The second load event is triggered by loadURI with the URL
        // being the necko URL to the given message. These are the late
        // adjustments that (possibly) depend on the message being actually,
        // fully, completely loaded.
        iframe.addEventListener("load", function f_temp1(event) {
          try {
            iframe.removeEventListener("load", f_temp1, true);

            // Notify hooks that we just finished displaying a message. Must be
            //  performed now, not later. This gives plugins a chance to modify
            //  the DOM of the message (i.e. decrypt it) before we tweak the
            //  fonts and stuff.
            for (let h of getHooks()) {
              try {
                if (typeof(h.onMessageStreamed) == "function")
                  h.onMessageStreamed(self._msgHdr, self._domNode, msgWindow, self);
              } catch (e) {
                Log.warn("Plugin returned an error:", e);
                dumpCallStack(e);
              }
            }

            let iframeDoc = iframe.contentDocument;
            if (self.checkForFishing(iframeDoc) && !self._msgHdr.getUint32Property("notAPhishMessage")) {
              Log.debug("Phishing attempt");
              self._domNode.getElementsByClassName("phishingBar")[0].style.display = "block";
            }

            // For bidiUI. Do that now because the DOM manipulations are
            //  over. We can't do this before because BidiUI screws up the
            //  DOM. Don't know why :(.
            // We can't do this as a plugin (I wish I could!) because this is
            //  too entangled with the display logic.
            let mainWindow = topMail3Pane(self);
            if ("BiDiMailUI" in mainWindow) {
              let ActionPhases = mainWindow.BiDiMailUI.Display.ActionPhases;
              try {
                let domDocument = iframe.docShell.contentViewer.DOMDocument;
                let body = domDocument.body;

                let BDMCharsetPhaseParams = {
                  body,
                  charsetOverrideInEffect: msgWindow.charsetOverride,
                  currentCharset: msgWindow.mailCharacterSet,
                  messageHeader: self._msgHdr,
                  unusableCharsetHandler: mainWindow
                    .BiDiMailUI.MessageOverlay.promptForDefaultCharsetChange,
                  needCharsetForcing: false,
                  charsetToForce: null,
                };
                ActionPhases.charsetMisdetectionCorrection(BDMCharsetPhaseParams);
                if (BDMCharsetPhaseParams.needCharsetForcing
                    && BDMCharsetPhaseParams.charsetToForce != aCharset) {
                  // XXX this doesn't take into account the case where we
                  // have a cycle with length > 0 in the reloadings.
                  // Currently, I only see UTF8 -> UTF8 cycles.
                  Log.debug("Reloading with " + BDMCharsetPhaseParams.charsetToForce);
                  f_temp2(null, BDMCharsetPhaseParams.charsetToForce);
                  return;
                }
                ActionPhases.htmlNumericEntitiesDecoding(body);
                ActionPhases.quoteBarsCSSFix(domDocument);
                ActionPhases.directionAutodetection(domDocument);
              } catch (e) {
                Log.error(e);
                dumpCallStack(e);
              }
            }

            // Everything's done, so now we're able to settle for a height.
            // adjustHeight();

            // Sometimes setting the iframe's content and height changes
            // the scroll value, don't know why.
            if (false && originalScroll) {
              self._domNode.ownerDocument.documentElement.scrollTop = originalScroll;
            }

            // Send "msgLoaded" event
            self._msgHdr.folder.NotifyPropertyFlagChanged(self._msgHdr, "msgLoaded", 0, 1);
            self._msgHdr.folder.lastMessageLoaded = self._msgHdr.messageKey;

            self._didStream = true;
            if (Prefs.getInt("mail.show_headers") == kHeadersShowAll)
              self.showDetails(() => self._signal());
            else
              self._signal();
          } catch (e) {
            try {
              // adjustHeight();
            } catch (e) {
              iframe.style.height = "800px";
            }
            Log.error(e);
            dumpCallStack(e);
            Log.warn("Running signal once more to make sure we move on with our life... (warning, this WILL cause bugs)");
            self._didStream = true;
            self._signal();
          }
        }, true); /* end iframe.addEventListener */
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, true); /* end document.addEventListener */

    // Ok, brace ourselves for notifications happening during the message load
    //  process.
    addMsgListener(this);

    // This triggers the whole process. We assume (see beginning) that the
    // message is expanded which means the <iframe> will be visible right away
    // which means we can use offsetHeight, getComputedStyle and stuff on it.
    let container = this._domNode.getElementsByClassName("iframe-container")[0];
    container.appendChild(iframe);
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

  openInClassic(mainWindow) {
    let tabmail = mainWindow.document.getElementById("tabmail");
    tabmail.openTab("message", { msgHdr: this._msgHdr, background: false });
  },

  openInSourceView(mainWindow) {
    mainWindow.ViewPageSource([this._uri]);
  },
};

MixIn(Message, EventHelperMixIn);

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

/**
 * This additional class holds all of the bad heuristics we're performing on a
 *  message's inner DOM once it's been displayed in the conversation view. These
 *  include tweaking the fonts, detectin quotes, etc.
 * As it doesn't belong to the main logic, we're doing this in a separate class
 *  that's MixIn'd the Message class.
 */
let PostStreamingFixesMixIn = {
  // This is the naming convention to define a getter, per MixIn's definition
  get_defaultSize() {
    return Prefs.getInt("font.size.variable.x-western");
  },

  injectCss(iframeDoc) {
    let styleRules = [];
    // !important because messageContents.css is appended after us when the html
    // is rendered
    styleRules = styleRules.concat([
      "blockquote[type=\"cite\"] {",
      "  border-right-width: 0px;",
      "  border-left: 1px #ccc solid;",
      "  color: #666 !important;",
      "}",
      "span.moz-txt-formfeed {",
      "  height: auto;",
      "}",
    ]);

    // Ugly hack (once again) to get the style inside the
    // <iframe>. I don't think we can use a chrome:// url for
    // the stylesheet because the iframe has a type="content"
    let style = iframeDoc.createElement("style");
    style.appendChild(iframeDoc.createTextNode(styleRules.join("\n")));
    let head = iframeDoc.body.previousElementSibling;
    head.appendChild(style);
  },

  tweakFonts(iframeDoc) {
    if (!Prefs.tweak_bodies)
      return;

    let textSize = Math.round(this.defaultSize * tenPxFactor() * 1.2);

    // Assuming 16px is the default (like on, say, Linux), this gives
    //  18px and 12px, which is what Andy had in mind.
    // We're applying the style at the beginning of the <head> tag and
    //  on the body element so that it can be easily overridden by the
    //  html.
    // This is for HTML messages only.
    let styleRules = [];
    if (iframeDoc.querySelectorAll(":not(.mimemail-body) > .moz-text-html").length) {
      styleRules = [
        "body, table {",
        // "  line-height: 112.5%;",
        "  font-size: " + textSize + "px;",
        "}",
      ];
    }

    // Unless the user specifically asked for this message to be
    //  dislayed with a monospaced font...
    let [{/* name, */ email}] = this.parse(this._msgHdr.author);
    if (email && !(email.toLowerCase() in Prefs.monospaced_senders) &&
        !(this.mailingLists.some(x => (x.toLowerCase() in Prefs.monospaced_senders)))) {
      styleRules = styleRules.concat([
        ".moz-text-flowed, .moz-text-plain {",
        "  font-family: sans-serif !important;",
        "  font-size: " + textSize + "px !important;",
        "  line-height: 112.5% !important;",
        "}",
      ]);
    }

    // Do some reformatting + deal with people who have bad taste. All these
    // rules are important: some people just send messages with horrible colors,
    // which ruins the conversation view. Gecko tends to automatically add
    // padding/margin to html mails. We still want to honor these prefs but
    // usually they just black/white so this is pretty much what we want.
    let fg = Prefs.getChar("browser.display.foreground_color");
    let bg = Prefs.getChar("browser.display.background_color");
    styleRules = styleRules.concat([
      "body {",
      "  margin: 0; padding: 0;",
      "  color: " + fg + "; background-color: " + bg + ";",
      "}",
    ]);

    // Ugly hack (once again) to get the style inside the
    // <iframe>. I don't think we can use a chrome:// url for
    // the stylesheet because the iframe has a type="content"
    let style = iframeDoc.createElement("style");
    style.appendChild(iframeDoc.createTextNode(styleRules.join("\n")));
    let head = iframeDoc.body.previousElementSibling;
    if (head.firstChild)
      head.insertBefore(style, head.firstChild);
    else
      head.appendChild(style);
  },

  convertCommonQuotingToBlockquote(iframe) {
    // Launch various crappy pieces of code^W^W^W^W heuristics to
    //  convert most common quoting styles to real blockquotes. Spoiler:
    //  most of them suck.
    let iframeDoc = iframe.contentDocument;
    try {
      convertOutlookQuotingToBlockquote(iframe.contentWindow, iframeDoc);
      convertHotmailQuotingToBlockquote1(iframeDoc);
      convertForwardedToBlockquote(iframeDoc);
      convertMiscQuotingToBlockquote(iframeDoc);
      fusionBlockquotes(iframeDoc);
    } catch (e) {
      Log.warn(e);
      dumpCallStack(e);
    }
  },

  detectBlocks(iframe, testNode, hideText, showText, linkClass, linkColor) {
    let self = this;
    let iframeDoc = iframe.contentDocument;

    let smallSize = Prefs.tweak_chrome
      ? this.defaultSize * tenPxFactor() * 1.1
      : Math.round(100 * this.defaultSize * 11 / 12) / 100;

    // this function adds a show/hide block text link to every topmost
    // block. Nested blocks are not taken into account.
    let walk = function walk_(elt) {
      for (let i = elt.childNodes.length - 1; i >= 0; --i) {
        let c = elt.childNodes[i];

        if (testNode(c)) {
          let div = iframeDoc.createElement("div");
          div.setAttribute("class", "link " + linkClass);
          div.addEventListener("click", function div_listener(event) {
            let h = self._conversation._htmlPane.toggleBlock(event, showText, hideText);
            iframe.style.height = (parseFloat(iframe.style.height) + h) + "px";
          }, true);
          div.setAttribute("style", "color: " + linkColor + "; cursor: pointer; font-size: " + smallSize + "px;");
          div.appendChild(iframeDoc.createTextNode("- " + showText + " -"));
          elt.insertBefore(div, c);
          c.style.display = "none";
        } else {
          walk(c);
        }
      }
    };

    walk(iframeDoc);
  },

  detectQuotes(iframe) {
    let self = this;
    self.convertCommonQuotingToBlockquote(iframe);

    let isBlockquote = function isBlockquote_(node) {
      if (node.tagName && node.tagName.toLowerCase() == "blockquote") {
        // Compute the approximate number of lines while the element is still visible
        let style;
        try {
          style = iframe.contentWindow.getComputedStyle(node);
        } catch (e) {
          // message arrived and window is not displayed, arg,
          // cannot get the computed style, BAD
        }
        if (style) {
          let numLines = parseInt(style.height) / parseInt(style.lineHeight);
          if (numLines > Prefs.hide_quote_length) {
            return true;
          }
        }
      }

      return false;
    };

    // https://github.com/protz/thunderbird-conversations/issues#issue/179
    // See link above for a rationale ^^
    if (self.initialPosition > 0)
      self.detectBlocks(iframe,
        isBlockquote,
        strings.get("hideQuotedText"),
        strings.get("showQuotedText"),
        "showhidequote",
        "orange"
      );
  },

  detectSigs(iframe) {
    let self = this;

    let isSignature = function isSignature_(node) {
      return (node.classList && node.classList.contains("moz-txt-sig"));
    };

    if (Prefs.hide_sigs) {
      self.detectBlocks(iframe,
        isSignature,
        strings.get("hideSigText"),
        strings.get("showSigText"),
        "showhidesig",
        "rgb(56, 117, 215)"
      );
    }
  },

  /**
   * The phishing detector that's in Thunderbird would need a lot of rework:
   * it's not easily extensible, and the code has a lot of noise, i.e. it just
   * performs simple operations but it's written in a convoluted way. We should
   * just rewrite everything, but for now, we just rewrite+simplify the main
   * function, and still rely on the badly-designed underlying functions for the
   * low-level treatments.
   */
  checkForFishing(iframeDoc) {
    if (!Prefs.getBool("mail.phishing.detection.enabled"))
      return false;

    let gPhishingDetector = topMail3Pane(this).gPhishingDetector;
    let isPhishing = false;
    let links = iframeDoc.getElementsByTagName("a");
    for (let a of links) {
      if (!a)
        continue;
      let linkText = a.textContent;
      let linkUrl = a.getAttribute("href");
      let hrefURL;
      // make sure relative link urls don't make us bail out
      try {
        hrefURL = Services.io.newURI(linkUrl);
      } catch (ex) {
        continue;
      }

      // only check for phishing urls if the url is an http or https link.
      // this prevents us from flagging imap and other internally handled urls
      if (hrefURL.schemeIs("http") || hrefURL.schemeIs("https")) {
        // The link is not suspicious if the visible text is the same as the URL,
        // even if the URL is an IP address. URLs are commonly surrounded by
        // < > or "" (RFC2396E) - so strip those from the link text before comparing.
        if (linkText)
          linkText = linkText.replace(/^<(.+)>$|^"(.+)"$/, "$1$2");

        let failsStaticTests = false;
        if (linkText != linkUrl) {
          let unobscuredHostNameValue = isLegalIPAddress(hrefURL.host);
          failsStaticTests =
            unobscuredHostNameValue
              && !isLegalLocalIPAddress(unobscuredHostNameValue)
            || linkText
              && gPhishingDetector.misMatchedHostWithLinkText(hrefURL, linkText);
        }

        if (failsStaticTests) {
          Log.debug("Suspicious link", linkUrl);
          isPhishing = true;
          break;
        }
      }
    }
    return isPhishing;
  },

  _getAnchor(href) {
    // Libmime has decided to rewrite the anchors for us, so try to
    // reverse-engineer that...
    if (!href.indexOf("imap://") == 0 && !href.indexOf("mailbox://") == 0)
      return false;
    try {
      let uri = Services.io.newURI(href);
      if (!(uri instanceof Ci.nsIMsgMailNewsUrl))
        return false;
      uri.QueryInterface(Ci.nsIURL);
      let ref = uri.ref;
      if (!ref.length)
        return false;
      return ref;
    } catch (e) {
      Log.debug(e);
      return false;
    }
  },

  registerLinkHandlers(iframe) {
    let self = this;
    let iframeDoc = iframe.contentDocument;
    let mainWindow = topMail3Pane(this);
    for (let a of iframeDoc.querySelectorAll("a")) {
      if (!a)
        continue;
      let anchor = this._getAnchor(a.href);
      if (anchor) {
        // It's an anchor, do the scrolling ourselves since, for security
        // reasons, content cannot scroll its outer chrome document.
        a.addEventListener("click", function link_listener(event) {
          let node = iframeDoc.getElementsByName(anchor)[0];
          let w = self._conversation._htmlPane;
          let o1 = w.$(node).offset().top;
          let o2 = w.$(iframe).offset().top;
          w.scrollTo(0, o1 + o2 + 5 - 44);
        }, true);
      } else {
        // Attach the required event handler so that links open in the external
        // browser.
        a.addEventListener("click",
          event => mainWindow.specialTabs.siteClickHandler(event, /^mailto:/),
          true);
      }
    }
  },
};

MixIn(Message, PostStreamingFixesMixIn);
