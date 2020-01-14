/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported registerQuickReply, newComposeSessionByClick, changeComposeFields,
            showCc, showBcc, addAttachment, confirmDiscard, quickReplyDragEnter,
            quickReplyCheckDrag, quickReplyDrop */
/* exported htmlToPlainText */
// Via stub.xhtml
/* global Conversations, closeTab, Prefs, msgUriToMsgHdr, tmpl, Services, topMail3Pane */

/* import-globals-from stub.completion-ui.js */

"use strict";

var { msgHdrsArchive, msgHdrIsArchive, msgHdrGetUri } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/msgHdrUtils.js"
);
var { sendMessage } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/send.js"
);
var {
  composeInIframe,
  htmlToPlainText,
  replyAllParams,
  parse,
} = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/compose.js"
);
var { getHooks } = ChromeUtils.import(
  "chrome://conversations/content/modules/hook.js"
);
var { fixIterator } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { parseMimeLine } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/misc.js"
);
var { defaultPhotoURI } = ChromeUtils.import(
  "chrome://conversations/content/modules/contact.js"
);

Log = setupLogging("Conversations.Stub.Compose");

// SimpleStorage has been removed, and this data is migrated into the store.
// See addon/prefs.js for more info.
var { SimpleStorage } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/SimpleStorage.js",
  {}
);

const SIMPLE_STORAGE_TABLE_NAME = "conversations";

window.addEventListener("unload", function() {
  // save if needed
  onSave(function() {
    Log.debug("Unload.");
  });
});

var gDraftListener;

/**
 * Called either by the monkey-patch when the conversation is fully built, or by
 *  stub.html when the conversation-in-tab is fully built. This function can
 *  only run once the conversation it lives in is complete. Is NOT called if the
 *  conversation is updated, etc.
 * What this function does is:
 * - register global event listeners so that if someone else modifies this
 *   conversation's draft in a different tab/window, it receives the update and
 *   changes its parameters accordingly;
 * - add event listeners for the shiny-shiny animations that take place when
 *   one clicks on one of the textareas;
 * - register event listeners that kick an auto-save when it's worth doing it.
 */
function registerQuickReply() {
  let id = Conversations.currentConversation.id;
  let mainWindow = topMail3Pane(window);

  gDraftListener = {
    onDraftChanged(aTopic) {
      try {
        Log.debug("onDraftChanged", Conversations == mainWindow.Conversations);
        switch (aTopic) {
          case "modified":
            newComposeSessionByDraftIf().catch(Cu.reportError);
            break;
          case "removed":
            getActiveEditor().value = "";
            hideCompositionFields();
            resetCompositionFields();
            $(".quickReplyHeader").hide();
            gComposeSession = null;
            hideQuickReply();
            break;
        }
      } catch (e) {
        // Most likely, the window has been tore down, but the listener is still
        // alive, so all references it holds are dead. Failures usually look
        // like "Log is undefined".
        dump(e + "\n");
        dump(e.stack + "\n");
      }
    },

    notifyDraftChanged(aTopic) {
      try {
        Log.debug("Notifying draft listeners for id", id);
        let listeners = mainWindow.Conversations.draftListeners[id] || [];
        for (let listener of listeners) {
          let obj = listener.get();
          if (!obj || obj == this) {
            continue;
          }
          obj.onDraftChanged(aTopic);
        }
        // While we're at it, cleanup...
        listeners = listeners.filter(x => x.get());
        mainWindow.Conversations.draftListeners[id] = listeners;
      } catch (e) {
        // See comment above
        dump(e + "\n");
        dump(e.stack + "\n");
      }
    },
  };

  if (!(id in mainWindow.Conversations.draftListeners)) {
    mainWindow.Conversations.createDraftListenerArrayForId(id);
    // We can't use the (seemingly) simple line below because the array would be
    // allocated in the xhtml compartment, which would then get nuked, and
    // create errors later on while we expect the array to still be valid.
    // mainWindow.Conversations.draftListeners[id] = [];
  }
  let weakRef = Cu.getWeakReference(gDraftListener);
  mainWindow.Conversations.draftListeners[id].push(weakRef);

  $("textarea").blur(function() {
    Log.debug("Autosave opportunity...");
    onSave();
  });

  // Will set the placeholder.
  registerQuickReplyEventListeners();

  // Bold, italics, etC.
  registerQuickReplyDocumentCommands();
}

// This function is called once when the conversation is complete, and then
//  potentially many times, if someone is editing the draft in another instance
//  of the same conversation (i.e. if the conversation has another instance in a
//  separate tab).
// We ignore the edge cases where the set of messages in the conversation view
//  doesn't correspond to a real gloda conversation (i.e. in the case of
//  non-strict threading or custom queries). That's problematic because the same
//  conversation might end up having different Gloda ids... hell, that's too
//  bad.
async function newComposeSessionByDraftIf() {
  let id = Conversations.currentConversation.id; // Gloda ID
  if (!id) {
    $("#save").attr("disabled", "disabled");
    return;
  }

  let r = await SimpleStorage.get(SIMPLE_STORAGE_TABLE_NAME, id);

  if (r) {
    gComposeSession = createComposeSession(x => x.draft(r));
    startedEditing(true);
    revealCompositionFields();
    showQuickReply.call($(".quickReply li.reply"));
  }
}

// Called when we need to expand the textarea and start editing a new message.
// The type parameter is determined by the event listeners (see quickReply.js)
// as they know whether the user clicked reply or reply all.
function newComposeSessionByClick(type) {
  Log.assert(
    !gComposeSession,
    "We should only get here if there's no compose session already"
  );
  Log.debug("Setting up the initial quick reply compose parameters...");
  try {
    gComposeSession = createComposeSession(x =>
      x.reply(getMessageForQuickReply(), type)
    );
    // This could probably be refined, like only considering we started editing
    // if we modified the body and/or the composition fields.
    startedEditing(true);
    revealCompositionFields();
  } catch (e) {
    Log.debug(e);
    dumpCallStack(e);
  }
}

function revealCompositionFields() {
  document.querySelector(".quickReply").classList.add("expand");
  $(".quickReplyRecipients").show();
}

function hideCompositionFields() {
  document.querySelector(".quickReply").classList.remove("expand");
  $(".quickReplyRecipients").hide();
}

function resetCompositionFields() {
  $(".showCc, .showBcc").show();
  $(".quickReplyRecipients").removeClass("edit");
  $(".bccList, .editBccList").css("display", "none");
  $(".ccList, .editCcList").css("display", "none");
}

function changeComposeFields(aMode) {
  resetCompositionFields();
  gComposeSession.changeComposeFields(aMode);
  if (aMode == "forward") {
    editFields("to");
  }
}

function showCc(event) {
  $(".ccList, .editCcList").css("display", "");
  $(".showCc").hide();
}

function showBcc(event) {
  $(".bccList, .editBccList").css("display", "");
  $(".showBcc").hide();
}

function addAttachment() {
  gComposeSession.attachmentList.add();
}

function editFields(aFocusId) {
  $(".quickReplyRecipients").addClass("edit");
  $("#" + aFocusId)
    .next()
    .find(".token-input-input-token-facebook input")
    .last()
    .focus();
}

function confirmDiscard(event) {
  if (!startedEditing() || confirm(strings.get("confirmDiscard"))) {
    onDiscard().catch(Cu.reportError);
  }
}

async function onDiscard(event) {
  if (isQuickCompose) {
    window.close();
    closeTab();
  } else {
    getActiveEditor().value = "";
    hideCompositionFields();
    resetCompositionFields();
    $(".quickReplyHeader").hide();
    hideQuickReply();
    gComposeSession = null;
    let id = Conversations.currentConversation.id;
    if (id) {
      await SimpleStorage.remove(SIMPLE_STORAGE_TABLE_NAME, id);
      gDraftListener.notifyDraftChanged("removed");
    }
  }
}

/**
 * Save the current draft, or do nothing if the user hasn't started editing the
 *  draft yet.
 * @param k (optional) A function to call once it's saved.
 */
async function onSave(k) {
  // First codepath, we ain't got no nothing to save.
  if (!startedEditing()) {
    if (k) {
      k();
    }
    return;
  }

  // Second codepath. Heh, got some work to do.
  Log.debug("Saving because there's a compose session");
  let id = Conversations.currentConversation.id; // Gloda ID
  if (id) {
    await SimpleStorage.set(SIMPLE_STORAGE_TABLE_NAME, id, {
      msgUri: msgHdrGetUri(gComposeSession.params.msgHdr),
      from: gComposeSession.params.identity.email,
      to: JSON.parse($("#to").val()).join(","),
      cc: JSON.parse($("#cc").val()).join(","),
      bcc: JSON.parse($("#bcc").val()).join(","),
      body: getActiveEditor().value,
      attachments: gComposeSession.attachmentList.save(),
    });
    gDraftListener.notifyDraftChanged("modified");
  }
  if (k) {
    k();
  }
}

// ----- The whole composition session and related actions...

var gComposeSession;

/**
 * Obviously going to be upgraded once we have one quick reply per message.
 */
function getMessageForQuickReply() {
  let conv = Conversations.currentConversation;
  return conv.messages[conv.messages.length - 1].message;
}

// Returns a wrapper around the iframe that stands for the editor
function getActiveEditor() {
  let textarea;
  if (gComposeSession) {
    gComposeSession.match({
      reply(_, aReplyType) {
        if (aReplyType == "reply") {
          textarea = document.querySelector("li.reply .textarea");
        } else if (aReplyType == "replyAll") {
          textarea = document.querySelector("li.replyAll .textarea");
        } else {
          Log.assert(false, "Unknown reply type");
        }
      },

      new() {
        textarea = document.querySelector("li.reply .textarea");
      },

      draft() {
        textarea = document.querySelector("li.reply .textarea");
      },
    });
  } else {
    // This happens if we are creating a draft instance.
    textarea = document.querySelector("li.reply .textarea");
  }
  return {
    node: textarea,
    get value() {
      return textarea.contentDocument.body.innerHTML;
    },
    set value(val) {
      // eslint-disable-next-line no-unsanitized/property
      textarea.contentDocument.body.innerHTML = val;
    },
  };
}

function createComposeSession(what) {
  // Do that now so that it doesn't have to be implemented by each compose
  // session type.
  if (Services.prefs.getBoolPref("mail.spellcheck.inline")) {
    for (let elt of document.getElementsByTagName("textarea")) {
      elt.setAttribute("spellcheck", true);
    }
  } else {
    for (let elt of document.getElementsByTagName("textarea")) {
      elt.setAttribute("spellcheck", false);
    }
  }
  return new ComposeSession(what);
}

/**
 * A jquery-like API. Pass nothing to get the value, pass a value to set it.
 */
function startedEditing(aVal) {
  if (aVal !== undefined) {
    if (!gComposeSession) {
      Log.error("No composition session yet");
      dumpCallStack();
    } else {
      gComposeSession.startedEditing = aVal;
    }
  }
  return gComposeSession && gComposeSession.startedEditing;
}

function ComposeSession(match) {
  // A visitor pattern.
  //  match({ reply(nsIMsgDbHdr), draft({ msgUri, from, to, cc, bcc, body }) })
  this.match = match;
  // A composition session may be setup (i.e. the fields in the UI filled with
  //  the right values), but that doesn't mean the user has edited it yet...
  this.startedEditing = false;
  // Shall we archive this conversation after sending?
  this.archive = false;
  // These are the parameters that are defined once at the beginning of the
  // compose session, and that won't change afterwards. Other parameters live in
  // the UI, and their value is extracted from the UI before sending the
  // message.
  this.params = {
    identity: null,
    msgHdr: null,
    subject: null,
    otherRandomHeaders: null,
  };
  this.stripSignatureIfNeeded = function() {
    let w = getActiveEditor().node.contentWindow;
    for (let sig of w.document.querySelectorAll(
      "blockquote[type=cite] .moz-signature"
    )) {
      sig.classList.add("moz-quoted-signature");
    }
    for (let sig of w.document.querySelectorAll(
      ".moz-signature:not(.moz-quoted-signature)"
    )) {
      sig.remove(sig);
    }
  };

  // Go!
  this.senderNameElem = $(".senderName");
  this.asyncSetupSteps = 4; // number of asynchronous setup functions to finish
  this.setupIdentity();
  this.setupMisc();
  this.setupAutocomplete();
  this.setupAttachments();
}

ComposeSession.prototype = {
  /* This function is called when you click on the small arrows in the quick reply next to the email address
   * you're using  for sending the message. The effect is that we cycle through the list of available identities
   * for sending that email. dir is either 1 or -1.
   */
  cycleSender(dir) {
    let self = this;
    let index = getIdentities().findIndex(
      ident => ident.identity == self.params.identity
    );
    index = (index + dir + getIdentities().length) % getIdentities().length;
    this.params.identity = getIdentities()[index].identity;
    this.senderNameElem.text(this.params.identity.email);
  },

  setupAttachments() {
    let self = this;
    this.match({
      new() {
        self.attachmentList = new AttachmentList();
        self.setupDone();
      },

      reply() {
        self.attachmentList = new AttachmentList();
        self.setupDone();
      },

      draft({ attachments }) {
        self.attachmentList = new AttachmentList();
        self.attachmentList.restore(attachments);
        self.setupDone();
      },
    });
  },

  setupIdentity() {
    let self = this;
    let identity;
    this.match({
      reply(aMessage, aReplyType) {
        let aMsgHdr = aMessage._msgHdr;
        let compType;
        if (aReplyType == "reply") {
          compType = Ci.nsIMsgCompType.ReplyToSender;
        } else if (aReplyType == "replyAll") {
          compType = Ci.nsIMsgCompType.ReplyAll;
        } else {
          Log.assert(false, "Unknown reply type");
        }
        // Standard procedure for finding which identity to send with, as per
        //  http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js#210
        let suggestedIdentity = MailUtils.getIdentityForHeader(
          aMsgHdr,
          compType
        );
        identity = suggestedIdentity || getDefaultIdentity().identity;
        self.setupDone();
      },

      draft({ from }) {
        // The from parameter is a string, it's the email address that uniquely
        //  identifies the identity. We have a fallback plan in case the user
        //  has deleted the identity in-between (sounds unlikely, but who
        //  knows?).
        identity =
          getIdentityForEmail(from).identity || getDefaultIdentity().identity;
        self.setupDone();
      },

      new() {
        // Do some work to figure what the "right" identity is for us.
        identity = getDefaultIdentity().identity;
        let selectedFolder = topMail3Pane(
          window
        ).gFolderTreeView.getSelectedFolders()[0];
        if (selectedFolder) {
          identity =
            selectedFolder.customIdentity ||
            topMail3Pane(window).getIdentityForServer(selectedFolder.server) ||
            identity;
        }
        // We're done!
        self.setupDone();
      },
    });
    self.senderNameElem.text(identity.email);
    self.params.identity = identity;
  },

  setupMisc() {
    let self = this;
    this.match({
      reply(aMessage) {
        let aMsgHdr = aMessage._msgHdr;
        self.params.msgHdr = aMsgHdr;
        self.params.subject = "Re: " + aMsgHdr.mime2DecodedSubject;
        self.setupDone();
      },

      draft({ msgUri }) {
        let last = a => a[a.length - 1];
        let msgHdr = msgUriToMsgHdr(msgUri);
        self.params.msgHdr =
          msgHdr || last(Conversations.currentConversation.msgHdrs);
        self.params.subject = "Re: " + self.params.msgHdr.mime2DecodedSubject;
        self.setupDone();
      },

      new() {
        let subjectNode = document.querySelector(".editSubject");
        subjectNode.style.display = "";
        let input = document.getElementById("subject");
        input.addEventListener("change", function() {
          self.params.subject = input.value;
        });
        self.setupDone();
      },
    });
  },

  // Calls k with the total number of people involved in a reply so that the
  // caller can determine whether to disable reply-all or not.
  changeComposeFields(aMode, k) {
    let identity = this.params.identity;
    let msgHdr = this.params.msgHdr;
    let defaultCc = "";
    let defaultBcc = "";
    if (identity.doCc) {
      defaultCc = identity.doCcList || "";
    }
    if (identity.doBcc) {
      defaultBcc = identity.doBccList || "";
    }

    let mergeDefault = function(aList, aDefault) {
      if (aDefault) {
        aDefault = aDefault.replace(/\s/g, "");
      }
      if (!aDefault) {
        // "" evaluates to false
        return aList;
      }
      for (let email of aDefault.split(/,/)) {
        if (!aList.some(x => x.email == email)) {
          aList.push(asToken(null, null, email, null));
        }
      }
      return aList;
    };

    switch (aMode) {
      case "replyAll": {
        replyAllParams(identity, msgHdr, function(params) {
          let to = params.to.map(([name, email]) =>
            asToken(null, name, email, null)
          );
          let cc = params.cc.map(([name, email]) =>
            asToken(null, name, email, null)
          );
          let bcc = params.bcc.map(([name, email]) =>
            asToken(null, name, email, null)
          );
          cc = mergeDefault(cc, defaultCc);
          bcc = mergeDefault(bcc, defaultBcc);
          setupAutocomplete(to, cc, bcc);
          k && k(to.length + cc.length + bcc.length);
        });
        break;
      }

      case "replyList": {
        let cc = mergeDefault([], defaultCc);
        let bcc = mergeDefault([], defaultBcc);
        let msg = getMessageForQuickReply();
        let token = asToken(null, null, msg.mailingLists[0], null);
        setupAutocomplete([token], cc, bcc);
        break;
      }

      case "forward": {
        let cc = mergeDefault([], defaultCc);
        let bcc = mergeDefault([], defaultBcc);
        setupAutocomplete([], cc, bcc);
        break;
      }

      case "reply":
      default: {
        let cc = mergeDefault([], defaultCc);
        let bcc = mergeDefault([], defaultBcc);
        replyAllParams(identity, msgHdr, function(params) {
          let to = params.to.map(([name, email]) =>
            asToken(null, name, email, null)
          );
          setupAutocomplete(to, cc, bcc);
          k && k(params.to.length + params.cc.length + params.bcc.length);
        });
        break;
      }
    }
  },

  setupAutocomplete() {
    let self = this;
    this.match({
      reply(aMessage, aReplyType) {
        // Make sure we're consistent with modules/message.js!
        let showHideActions = function(n) {
          // This basically says that while processing various headers, we
          // found out we reply to at most one person, then this means that
          // the reply method "reply all" makes no sense.
          if (n <= 1) {
            $(".replyMethod-replyAll").hide();
            $(".replyMethod-replyList").hide();
          } else {
            $(".replyMethod-replyAll").show();
            $(".replyMethod-replyList").show();
          }
          self.setupDone();
        };
        if (aReplyType == "replyAll") {
          self.changeComposeFields("replyAll", showHideActions);
          $(".replyMethod > input").val(["replyAll"]);
        } else if (aReplyType == "reply") {
          self.changeComposeFields("reply", showHideActions);
          $(".replyMethod > input").val(["reply"]);
        } else {
          Log.assert(false, "Unknown reply type");
        }
      },

      draft({ to, cc, bcc }) {
        let makeTokens = function(aList) {
          let [list, listEmailAddresses] = parse(aList);
          return Array.prototype.map.call(list, function(item, i) {
            return asToken(null, item, listEmailAddresses[i], null);
          });
        };
        setupAutocomplete(makeTokens(to), makeTokens(cc), makeTokens(bcc));
        self.setupDone();
      },

      new() {
        setupAutocomplete([], [], []);
        self.setupDone();
      },
    });
  },

  setupFinal() {
    let self = this;
    this.match({
      reply(aMessage, aReplyType) {
        let aMsgHdr = aMessage._msgHdr;
        // Can't use getActiveEditor() at this stage because gComposeSession
        // hasn't been set yet.
        let iframe =
          aReplyType == "reply"
            ? document.querySelector("li.reply .textarea")
            : document.querySelector("li.replyAll .textarea");
        composeInIframe(iframe, {
          msgHdr: aMsgHdr,
          compType: Ci.nsIMsgCompType.ReplyAll,
          identity: self.params.identity,
        });
      },

      draft({ body }) {
        let node = getActiveEditor();
        node.value = body;
      },

      new() {
        let iframe = document.querySelector("li.reply .textarea");
        composeInIframe(iframe, {
          msgHdr: null,
          compType: Ci.nsIMsgCompType.New,
          identity: self.params.identity,
        });
      },
    });
  },

  setupDone() {
    // wait till all (asynchronous) setup steps are finished
    if (!--this.asyncSetupSteps) {
      this.setupFinal();
      let recipients = {
        to: JSON.parse($("#to").val()),
        cc: JSON.parse($("#cc").val()),
        bcc: JSON.parse($("#bcc").val()),
      };
      for (let h of getHooks()) {
        try {
          if (typeof h.onComposeSessionChanged == "function") {
            h.onComposeSessionChanged(
              this,
              getMessageForQuickReply(),
              recipients,
              getActiveEditor(),
              window
            );
          }
        } catch (e) {
          Log.warn("Plugin returned an error:", e);
          dumpCallStack(e);
        }
      }
    }
  },

  send(options) {
    let self = this;
    let popOut = options && options.popOut;
    this.archive = options && options.archive;
    let ed = getActiveEditor();
    let msg = strings.get("sendAnEmptyMessage");
    if (!popOut && !ed.value.length && !confirm(msg)) {
      return;
    }

    let deliverMode;
    if (Services.io.offline) {
      deliverMode = Ci.nsIMsgCompDeliverMode.Later;
    } else if (Services.prefs.getBoolPref("mailnews.sendInBackground")) {
      deliverMode = Ci.nsIMsgCompDeliverMode.Background;
    } else {
      deliverMode = Ci.nsIMsgCompDeliverMode.Now;
    }

    let compType;
    if (isQuickCompose) {
      compType = Ci.nsIMsgCompType.New;
    } else if (document.getElementById("forward-radio").checked) {
      compType = Ci.nsIMsgCompType.ForwardInline;
    } else {
      compType = Ci.nsIMsgCompType.ReplyAll;
    } // ReplyAll, Reply... ends up the same

    let [to, cc, bcc] = ["to", "cc", "bcc"].map(x =>
      JSON.parse($("#" + x).val())
    );

    let sendStatus = {};
    for (let priority of ["_early", "", "_canceled"]) {
      for (let h of getHooks()) {
        try {
          if (
            typeof h["onMessageBeforeSendOrPopout" + priority] == "function" &&
            (priority != "_canceled" || sendStatus.canceled)
          ) {
            let newSendStatus = h["onMessageBeforeSendOrPopout" + priority](
              {
                params: self.params,
                to,
                cc,
                bcc,
              },
              ed,
              sendStatus,
              popOut,
              self.attachmentList,
              window
            );
            if (priority != "_canceled") {
              sendStatus = newSendStatus;
            }
          }
        } catch (e) {
          Log.warn("Plugin returned an error:", e);
          dumpCallStack(e);
        }
      }
    }

    if (sendStatus.canceled) {
      pText(strings.get("messageSendingCanceled"));
      $(".statusPercentage").hide();
      $(".statusThrobber").hide();
      $(".quickReplyHeader").show();
      return;
    }

    let urls = self.params.msgHdr ? [msgHdrGetUri(self.params.msgHdr)] : [];

    let identity = self.params.identity;
    if (!popOut && (identity.doCc || identity.doBcc)) {
      // create new identity to avoid resetting default cc/bcc
      if (!self._fakeIdentity) {
        self._fakeIdentity = MailServices.accounts.createIdentity();
      }
      self._fakeIdentity.copy(identity);
      identity = self._fakeIdentity;
    }

    sendMessage(
      {
        urls,
        identity,
        to: to.join(","),
        cc: cc.join(","),
        bcc: bcc.join(","),
        subject: self.params.subject,
        securityInfo: sendStatus.securityInfo,
        otherRandomHeaders: self.params.otherRandomHeaders,
        attachments: self.attachmentList.attachments,
      },
      {
        compType,
        deliverType: deliverMode,
      },
      {
        match(x) {
          x.editor(ed.node);
        },
      },
      {
        progressListener,
        sendListener,
        stateListener: createStateListener(
          self,
          Conversations.currentConversation.msgHdrs,
          Conversations.currentConversation.id
        ),
      },
      {
        popOut,
        archive: self.archive,
      }
    );
  },
};

// Stolen from MsgComposeCommands.js

function nsAttachmentOpener() {}

nsAttachmentOpener.prototype = {
  QueryInterface: ChromeUtils.generateQI([
    Ci.nsIURIContentListener,
    Ci.nsIInterfaceRequestor,
  ]),

  onStartURIOpen(uri) {
    return false;
  },

  doContent(contentType, isContentPreferred, request, contentHandler) {
    return false;
  },

  isPreferred(contentType, desiredContentType) {
    return false;
  },

  canHandleContent(contentType, isContentPreferred, desiredContentType) {
    return false;
  },

  getInterface(iid) {
    if (iid.equals(Ci.nsIDOMWindow)) {
      return window;
    }

    return this.QueryInterface(iid);
  },

  loadCookie: null,
  parentContentListener: null,
};

// ----- Attachment list

function AttachmentList() {
  // An array of nsIMsgAttachment
  this._attachments = [];
}

AttachmentList.prototype = {
  add() {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    filePicker.init(
      window,
      strings.get("attachFiles"),
      Ci.nsIFilePicker.modeOpenMultiple
    );
    let self = this;
    filePicker.open(function(rv) {
      if (rv != Ci.nsIFilePicker.returnOK) {
        Log.debug("User canceled, returning");
      } else {
        // Iterate over all files
        for (let file of fixIterator(filePicker.files, Ci.nsIFile)) {
          self.addWithData({
            url: Services.io.newFileURI(file).spec,
            name: file.leafName,
            size: file.fileSize,
          });
        }
      }
    });
  },

  _populateUI(msgAttachment, data) {
    let self = this;
    let line = tmpl("#quickReplyAttachmentTemplate", data);
    line.find(".openAttachmentLink").click(function() {
      let url = Services.io.newURI(data.url);
      url = url.QueryInterface(Ci.nsIURL);

      if (url) {
        let channel = Services.io.newChannelFromURI(url);
        if (channel) {
          let uriLoader = Cc["@mozilla.org/uriloader;1"].getService(
            Ci.nsIURILoader
          );
          uriLoader.openURI(channel, true, new nsAttachmentOpener());
        }
      }
    });
    line.find(".removeAttachmentLink").click(function() {
      line.remove();
      self._attachments = self._attachments.filter(x => x != msgAttachment);
    });
    line.appendTo($(".quickReplyAttachments"));
  },

  addWithData(aData) {
    let msgAttachment = Cc[
      "@mozilla.org/messengercompose/attachment;1"
    ].createInstance(Ci.nsIMsgAttachment);
    msgAttachment.url = aData.url;
    if (aData.size != undefined) {
      msgAttachment.size = aData.size;
    }
    msgAttachment.name = aData.name || strings.get("attachment");
    this._attachments.push(msgAttachment);

    this._populateUI(msgAttachment, {
      name: aData.name || strings.get("attachment"),
      size: aData.size
        ? topMail3Pane(window).messenger.formatFileSize(aData.size)
        : strings.get("sizeUnknown"),
      url: aData.url,
    });
  },

  restore(aData) {
    // Todo: check that all files still exist, etc.
    for (let data of aData) {
      this.addWithData(data);
    }
  },

  save() {
    return this._attachments.map(x => ({
      name: x.name,
      size: x.size,
      url: x.url,
    }));
  },

  get attachments() {
    return this._attachments;
  },
};

function attachmentDataFromDragData(event) {
  let size, prettyName, url;
  let fileData = event.dataTransfer.getData("application/x-moz-file");
  let urlData = event.dataTransfer.getData("text/x-moz-url");
  let messageData = event.dataTransfer.getData("text/x-moz-message");
  // Log.debug("file", fileData, "url", urlData, "message", messageData);

  if (fileData || urlData || messageData) {
    /* if (fileData) {
      // I don't understand how this is supposed to work since the newer
      // DataTransfer API doesn't allow putting nsIFiles in drag data...
      let fileHandler = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
      size = fileData.fileSize;
      url = fileHandler.getURLSpecFromFile(fileData);
    } else */
    if (messageData) {
      size = topMail3Pane(window)
        .messenger.messageServiceFromURI(messageData)
        .messageURIToMsgHdr(messageData).messageSize;
      url = messageData;
      prettyName = strings.get("attachedMessage");
    } else if (urlData) {
      let pieces = urlData.split("\n");
      url = pieces[0];
      if (pieces.length > 1) {
        prettyName = pieces[1];
      }
      if (pieces.length > 2) {
        size = parseInt(pieces[2]);
      }
      // If this is a local file, we may be able to recover some information...
      try {
        let uri = Services.io.newURI(url);
        let file = uri.QueryInterface(Ci.nsIFileURL).file;
        if (!prettyName) {
          prettyName = file.leafName;
        }
        if (!size) {
          size = file.fileSize;
        }
      } catch (e) {
        Log.debug("This is probably okay", e);
      }
    }

    let isValid = true;
    if (urlData) {
      try {
        let scheme = Services.io.extractScheme(url);
        // don't attach mailto: urls
        if (scheme == "mailto") {
          isValid = false;
        }
      } catch (ex) {
        isValid = false;
      }
    }

    if (isValid) {
      return { url, size, name: prettyName };
    }
  }
  return null;
}

function quickReplyDragEnter(event) {
  if (attachmentDataFromDragData(event) && !gComposeSession) {
    $(event.target).click();
    event.preventDefault();
  }
}

function quickReplyCheckDrag(event) {
  if (attachmentDataFromDragData(event)) {
    event.preventDefault();
  }
}

function quickReplyDrop(event) {
  let data = attachmentDataFromDragData(event);
  if (data) {
    gComposeSession.attachmentList.addWithData(data);
  }
}

// ----- Listeners.
//
// These are notified about the outcome of the send process and take the right
//  action accordingly (close window on success, etc. etc.)

function pValue(v) {
  $(".statusPercentage")
    .show()
    .text(v + "%");
  $(".statusThrobber").hide();
}

function pUndetermined() {
  $(".statusPercentage").hide();
  $(".statusThrobber").show();
}

function pText(t) {
  $(".statusMessage").text(t);
}

// all progress notifications are done through the nsIWebProgressListener implementation...
let progressListener = {
  onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
    Log.debug("onStateChange", aWebProgress, aRequest, aStateFlags, aStatus);
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      pUndetermined();
      $(".quickReplyHeader").show();
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      pValue(0);
      pText("");
    }
  },

  onProgressChange(
    aWebProgress,
    aRequest,
    aCurSelfProgress,
    aMaxSelfProgress,
    aCurTotalProgress,
    aMaxTotalProgress
  ) {
    Log.debug(
      "onProgressChange",
      aWebProgress,
      aRequest,
      aCurSelfProgress,
      aMaxSelfProgress,
      aCurTotalProgress,
      aMaxTotalProgress
    );
    // Calculate percentage.
    var percent;
    if (aMaxTotalProgress > 0) {
      percent = Math.round((aCurTotalProgress * 100) / aMaxTotalProgress);
      if (percent > 100) {
        percent = 100;
      }

      // Advance progress meter.
      pValue(percent);
    } else {
      // Progress meter should be barber-pole in this case.
      pUndetermined();
    }
  },

  onLocationChange(aWebProgress, aRequest, aLocation) {
    // we can ignore this notification
  },

  onStatusChange(aWebProgress, aRequest, aStatus, aMessage) {
    pText(aMessage);
  },

  onSecurityChange(aWebProgress, aRequest, state) {
    // we can ignore this notification
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIWebProgressListener]),
};

let sendListener = {
  /**
   * Notify the observer that the message has started to be delivered. This method is
   * called only once, at the beginning of a message send operation.
   *
   * @return The return value is currently ignored.  In the future it may be
   * used to cancel the URL load..
   */
  onStartSending(aMsgID, aMsgSize) {
    pText(strings.get("sendingMessage"));
    $("textarea, #send, #sendArchive").attr("disabled", "disabled");
    Log.debug("onStartSending", aMsgID, aMsgSize);
  },

  /**
   * Notify the observer that progress as occurred for the message send
   */
  onProgress(aMsgID, aProgress, aProgressMax) {
    Log.debug("onProgress", aMsgID, aProgress, aProgressMax);
  },

  /**
   * Notify the observer with a status message for the message send
   */
  onStatus(aMsgID, aMsg) {
    Log.debug("onStatus", aMsgID, aMsg);
  },

  /**
   * Notify the observer that the message has been sent.  This method is
   * called once when the networking library has finished processing the
   * message.
   *
   * This method is called regardless of whether the operation was successful.
   * aMsgID   The message id for the mail message
   * status   Status code for the message send.
   * msg      A text string describing the error.
   * returnFileSpec The returned file spec for save to file operations.
   */
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    // if (aExitCode == NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_REASON ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_REFUSED ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_TIMEOUT ||
    //     aExitCode == NS_ERROR_SMTP_PASSWORD_UNDEFINED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_FAILURE ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_GSSAPI ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_NOT_SUPPORTED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT ||
    //     aExitCode == NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS)
    //
    // Moar in mailnews/compose/src/nsComposeStrings.h
    Log.debug("onStopSending", aMsgID, aStatus, aMsg, aReturnFile);
    $("textarea, #send, #sendArchive").removeAttr("disabled");
    // This function is called only when the actual send has been performed,
    //  i.e. is not called when saving a draft (although msgCompose.SendMsg is
    //  called...)
    if (NS_SUCCEEDED(aStatus)) {
      // if (gOldDraftToDelete)
      //  msgHdrsDelete([gOldDraftToDelete]);
      pText(strings.get("messageSendingSuccess", [aMsgID]));
    } else {
      pText(strings.get("couldntSendTheMessage"));
      Log.debug("NS_FAILED onStopSending");
    }
    for (let h of getHooks()) {
      try {
        if (typeof h.onStopSending == "function") {
          h.onStopSending(aMsgID, aStatus, aMsg, aReturnFile);
        }
      } catch (e) {
        Log.warn("Plugin returned an error:", e);
        dumpCallStack(e);
      }
    }
  },

  /**
   * Notify the observer with the folder uri before the draft is copied.
   */
  onGetDraftFolderURI(aFolderURI) {
    Log.debug("onGetDraftFolderURI", aFolderURI);
  },

  /**
   * Notify the observer when the user aborts the send without actually doing the send
   * eg : by closing the compose window without Send.
   */
  onSendNotPerformed(aMsgID, aStatus) {
    Log.debug("onSendNotPerformed", aMsgID, aStatus);
  },

  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgSendListener]),
};

function createStateListener(aComposeSession, aMsgHdrs, aId) {
  return {
    NotifyComposeFieldsReady() {
      // ComposeFieldsReady();
    },

    NotifyComposeBodyReady() {
      // if (gMsgCompose.composeHTML)
      //   loadHTMLMsgPrefs();
      // AdjustFocus();
    },

    ComposeProcessDone(aResult) {
      Log.debug("ComposeProcessDone", NS_SUCCEEDED(aResult));
      if (NS_SUCCEEDED(aResult)) {
        // If the user didn't start a new composition session, hide the quick
        //  reply area, clear draft, collapse.
        if (!isQuickCompose && aComposeSession == gComposeSession) {
          resetCompositionFields();
          hideCompositionFields();
          getActiveEditor().value = "";
          $(".quickReplyHeader").hide();
          hideQuickReply();
          // We can do this because we're in the right if-block.
          gComposeSession = null;
          gDraftListener.notifyDraftChanged("removed");
        }
        // Remove the old stored draft, don't use onDiscard, because the compose
        //  params might have changed in the meanwhile.
        if (aId) {
          SimpleStorage.remove(SIMPLE_STORAGE_TABLE_NAME, aId).catch(
            Cu.reportError
          );
        }
        // Do stuff to the message we replied to.
        let msgHdr = aComposeSession.params.msgHdr;
        if (msgHdr) {
          msgHdr.folder.addMessageDispositionState(
            msgHdr,
            Ci.nsIMsgFolder.nsMsgDispositionState_Replied
          );
          msgHdr.folder.msgDatabase = null;
        }
        // Archive the whole conversation if needed
        if (aComposeSession.archive) {
          msgHdrsArchive(aMsgHdrs.filter(x => !msgHdrIsArchive(x)));
        }
        if (isQuickCompose) {
          // Try both, the first one will do nothing if in a tab.
          window.close();
          closeTab();
        }
      }
    },

    SaveInFolderDone(folderURI) {
      // DisplaySaveFolderDlg(folderURI);
    },
  };
}

/* This is our new hack: reuse this file to provide a standalone composition
 * window. Why? Because it uses gloda autocomplete and provides a
 * no-frills composition experience. */
/* exported masqueradeAsQuickCompose */
function masqueradeAsQuickCompose() {
  // TODO: Re-enable?
  // isQuickCompose = true;
  document.title = strings.get("write");
  document.querySelector("#conversationHeader").style.display = "none";
  document.querySelector(".bottom-links").style.display = "none";
  document.querySelector("#messageList").style.marginTop = "0";
  document.querySelector("#messageList").classList.add("quickCompose");
  tmpl("#quickReplyTemplate").appendTo($("#messageList"));
  $(".replyAll, #save, .replyMethod").remove();

  // TODO figure out why this timeout is needed
  setTimeout(function() {
    showQuickReply.call($(".reply.expand"));
    gComposeSession = createComposeSession(x => x.new());
    revealCompositionFields();
    editFields("to");
  }, 0);

  window.Conversations = {
    currentConversation: {
      msgHdrs: [],
      id: null,
    },
  };

  document
    .querySelector(".quickReply")
    .addEventListener("keypress", function(event) {
      switch (event.keyCode) {
        case KeyEvent.DOM_VK_RETURN:
          if (isAccel(event)) {
            if (event.shiftKey) {
              gComposeSession.send({ archive: true });
            } else {
              gComposeSession.send();
            }
          }
          break;
      }
    });

  let data = [];

  // Push a new contact item in the list
  let pushNewPopularContacts = function(n) {
    let items = data.splice(0, n);
    let nodes = tmpl("#popularContactTemplate", items);

    items.forEach(function(data2, i) {
      let data = data2;
      let node = nodes.eq(i);
      Log.debug("Adding", data.name, data.email);

      node.find(".popularRemove").click(function() {
        Log.debug("Removing", data.name, data.email);
        // Mark it in the prefs
        // TODO: Fix how these work.
        let unwantedRecipients = JSON.parse(
          Prefs.getString("conversations.unwanted_recipients")
        );
        unwantedRecipients[data.email] = null;
        Prefs.setString(
          "conversations.unwanted_recipients",
          JSON.stringify(unwantedRecipients)
        );
        // Update the UI
        $(this)
          .closest(".popularContact")
          .remove();
        pushNewPopularContacts(1);
      });

      node.find(".popularName").click(function() {
        // Get all the current parameters
        let to = JSON.parse($("#to").val());
        let cc = JSON.parse($("#cc").val());
        let bcc = JSON.parse($("#bcc").val());
        // Append our new value
        to.push(
          MailServices.headerParser.makeMimeAddress(data.name, data.email)
        );
        // Re-set everything
        let format = items =>
          items
            .map(parseMimeLine)
            .map(([{ name, email }]) => asToken(null, name, email, null));
        setupAutocomplete(format(to), format(cc), format(bcc));
        // Remove the node!
        node.remove();
        pushNewPopularContacts(1);
      });
    });

    nodes.appendTo($(".quickReplyContactsBox"));
  };

  $(".quickReplyContactsMoreLink").click(() => pushNewPopularContacts(10));

  // Fill in the "10 most popular contacts" thing
  let contactQuery = Gloda.newQuery(Gloda.NOUN_CONTACT);
  contactQuery.orderBy("-popularity").limit(100);
  let contactCollection = contactQuery.getCollection(
    {
      onItemsAdded(aItems, aCollection) {},
      onItemsModified(aItems, aCollection) {},
      onItemsRemoved(aItems, aCollection) {},
      onQueryCompleted(aCollection) {
        let items = aCollection.items;
        let unwantedRecipients = JSON.parse(
          Prefs.getString("conversations.unwanted_recipients")
        );

        for (let contact of items) {
          if (contact.identities.length) {
            let id = contact.identities[0];
            let photoForAbCard = function(card) {
              if (!card) {
                return defaultPhotoURI;
              }
              let url = card.getProperty("PhotoURI", "");
              if (!url) {
                return defaultPhotoURI;
              }
              return url;
            };
            if (id.kind == "email" && !(id.value in unwantedRecipients)) {
              // Log.debug("Pushing", id.value, contact.name, contact.popularity);
              data.push({
                email: id.value,
                name: contact.name,
                photo: photoForAbCard(id.abCard),
              });
            }
          }
        }

        pushNewPopularContacts(10);
      },
    },
    null
  );
  contactCollection.becomeExplicit();

  // Misc
  if (!top.opener) {
    window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
    window.frameElement.setAttribute("context", "mailContext");
  }
}
