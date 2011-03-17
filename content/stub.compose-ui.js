"use strict";

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/gloda/mimemsg.js"); // For MsgHdrToMimeMessage

const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);

Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/stdlib/send.js");
Cu.import("resource://conversations/stdlib/compose.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Stub.Compose");

Cu.import("resource://conversations/stdlib/SimpleStorage.js");
let ss = SimpleStorage.createIteratorStyle("conversations");

// ----- "Draft modified" listeners

let gDraftListener;

// Called either by the monkey-patch when the conversation is fully built, or by
//  stub.html when the conversation-in-tab is fully built. This function can
//  only run once the conversation it lives in is complete.
function registerQuickReply() {
  let id = Conversations.currentConversation.id;
  let mainWindow = getMail3Pane();

  gDraftListener = {
    onDraftChanged: function (aTopic) {
      try {
        Log.debug("onDraftChanged", Conversations == mainWindow.Conversations);
        switch (aTopic) {
          case "modified":
            loadDraft();
            break;
          case "removed":
            $(".quickReplyHeader").hide();
            $(".quickReply").removeClass('expand');
            $("textarea").val("");
            gComposeSession = null;
            break;
        }
      } catch (e) {
        // Most likely, the window has been tore down, but the listener is still
        // alive, so all references it holds are dead. Failures usually look
        // like "Log is undefined".
        dump(e+"\n");
        dump(e.stack+"\n");
      }
    },

    notifyDraftChanged: function (aTopic) {
      try {
        Log.debug("Notifying draft listeners for id", id);
        let listeners = mainWindow.Conversations.draftListeners[id] || [];
        for each (let [, listener] in Iterator(listeners)) {
          let obj = listener.get();
          if (!obj || obj == this)
            continue;
          obj.onDraftChanged(aTopic);
        }
        // While we're at it, cleanup...
        listeners = listeners.filter(function (x) x.get());
        mainWindow.Conversations.draftListeners[id] = listeners;
      } catch (e) {
        // See comment above
        dump(e+"\n");
        dump(e.stack+"\n");
      }
    },
  };

  Log.debug("Registering draft listener for id", id);
  if (!(id in mainWindow.Conversations.draftListeners))
    mainWindow.Conversations.draftListeners[id] = [];
  mainWindow.Conversations.draftListeners[id].push(Cu.getWeakReference(gDraftListener));

  $("textarea").blur(function () {
    Log.debug("Autosave...");
    onSave();
  });

}

// ----- Event listeners

// Called when we need to expand the textarea and start editing a new message
function onTextareaClicked(event) {
  // Do it just once
  if (!$(event.target).parent().hasClass('expand')) {
    $(event.target).parent().addClass('expand');
    if (!gComposeSession) { // first time
      Log.debug("Setting up the initial quick reply compose parameters...");
      let messages = Conversations.currentConversation.messages;
      try {
        gComposeSession = new ComposeSession(function (x)
          x.reply(messages[messages.length - 1].message._msgHdr)
        );
      } catch (e) {
        Log.debug(e);
        dumpCallStack(e);
      }
      scrollNodeIntoView(document.querySelector(".quickReply"));
    }
  }
}

function onUseEditor() {
  if (gComposeSession.send({ popOut: true }))
    onDiscard();
}

function showCc(event) {
  $(".ccList, .editCcList").css("display", "");
  $(".showCc").hide();
}

function showBcc(event) {
  $(".bccList, .editBccList").css("display", "");
  $(".showBcc").hide();
}

function editFields(aFocusId) {
  $('.quickReplyRecipients').addClass('edit');
  $("#"+aFocusId).next().find(".token-input-input-token-facebook input").last().focus();
}

function confirmDiscard(event) {
  if (!startedEditing() || confirm('Are you sure you wish to discard this message ?'))
    onDiscard();
}

function onDiscard(event) {
  $("textarea").val("");
  $(".quickReply").removeClass('expand');
  $(".quickReplyHeader").hide();
  let id = Conversations.currentConversation.id;
  if (id)
    SimpleStorage.spin(function () {
      let r = yield ss.remove(id);
      gComposeSession = null;
      gDraftListener.notifyDraftChanged("removed");
      yield SimpleStorage.kWorkDone;
    });
}

/**
 * Save the current draft, or do nothing if the user hasn't started editing the
 *  draft yet.
 * @param event The event that led to this.
 * @param aClose (optional) By default, true. Close the quick reply area after
 *  saving.
 * @param k (optional) A function to call once it's saved.
 */
function onSave(event, aClose, k) {
  // First codepath, we ain't got no nothing to save.
  if (!startedEditing()) {
    if (k)
      k();
    return;
  }

  // Second codepath. Heh, got some work to do.
  SimpleStorage.spin(function () {
    let id = Conversations.currentConversation.id; // Gloda ID
    if (id) {
      yield ss.set(id, {
        msgUri: msgHdrGetUri(gComposeSession.params.msgHdr),
        from: gComposeSession.params.identity.email,
        to: $("#to").val(),
        cc: $("#cc").val(),
        bcc: $("#bcc").val(),
        body: $("textarea").val()
      });
      gDraftListener.notifyDraftChanged("modified");
    }
    // undefined is ok, means true
    if (aClose === false)
      $(".quickReply").removeClass('expand');
    if (k)
      k();
    yield SimpleStorage.kWorkDone;
  });
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
function loadDraft() {
  let id = Conversations.currentConversation.id; // Gloda ID
  if (!id) {
    $("#save").attr("disabled", "disabled");
    return;
  }

  SimpleStorage.spin(function () {
    let r = yield ss.get(id);
    if (r) {
      gComposeSession = new ComposeSession(function (x) x.draft(r));
      startedEditing(true);
    }
    yield SimpleStorage.kWorkDone;
  });
}


// ----- The whole composition session and related actions...

let gComposeSession;

/**
 * A jquery-like API. Pass nothing to get the value, pass a value to set it.
 */
function startedEditing (aVal) {
  if (aVal === undefined) {
    return gComposeSession && gComposeSession.startedEditing;
  } else {
    if (!gComposeSession) {
      Log.error("No composition session yet");*
      dumpCallStack();
    } else {
      gComposeSession.startedEditing = aVal;
    }
  }
}

function ComposeSession (match) {
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
  };
  // Go!
  this.setupIdentity();
  this.setupMisc();
  this.setupAutocomplete();
  this.setupQuote();
}

ComposeSession.prototype = {

  setupIdentity: function () {
    let self = this;
    let mainWindow = getMail3Pane();
    let identity;
    this.match({
      reply: function (aMsgHdr) {
        // Standard procedure for finding which identity to send with, as per
        //  http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js#210
        let suggestedIdentity = mainWindow.getIdentityForHeader(aMsgHdr, Ci.nsIMsgCompType.ReplyAll);
        identity = suggestedIdentity || gIdentities.default;
      },

      draft: function ({ from }) {
        // The from parameter is a string, it's the email address that uniquely
        //  identifies the identity. We have a fallback plan in case the user
        //  has deleted the identity in-between (sounds unlikely, but who
        //  knows?).
        identity = gIdentities[from] || gIdentities.default;
      },
    });
    $(".senderName").text(identity.fullName + " <"+identity.email+">");
    self.params.identity = identity;
  },

  setupMisc: function () {
    let self = this;
    this.match({
      reply: function (aMsgHdr) {
        self.params.msgHdr = aMsgHdr;
        self.params.subject = "Re: "+aMsgHdr.mime2DecodedSubject;
      },

      draft: function ({ msgUri }) {
        let last = function (a) a[a.length-1];
        let msgHdr = msgUriToMsgHdr(msgUri);
        self.params.msgHdr = msgHdr || last(Conversations.currentConversation.msgHdrs);
        self.params.subject = "Re: "+self.params.msgHdr.mime2DecodedSubject;
      },
    });
  },

  setupAutocomplete: function () {
    let self = this;
    this.match({
      reply: function (aMsgHdr) {
        let identity = self.params.identity;
        let msgHdr = self.params.msgHdr;
        replyAllParams(identity, msgHdr, function (params) {
          let to = [asToken(null, name, email, null) for each ([name, email] in params.to)];
          let cc = [asToken(null, name, email, null) for each ([name, email] in params.cc)];
          let bcc = [asToken(null, name, email, null) for each ([name, email] in params.bcc)];
          setupAutocomplete(to, cc, bcc);
        });
      },

      draft: function ({ to, cc, bcc }) {
        let makeTokens = function (aList) {
          let [list, listEmailAddresses] = parse(aList);
          return [asToken(null, item, listEmailAddresses[i], null)
            for each ([i, item] in Iterator(list))];
        };
        setupAutocomplete(makeTokens(to), makeTokens(cc), makeTokens(bcc));
      },
    });
  },

  setupQuote: function () {
    this.match({
      reply: function (aMsgHdr) {
        quoteMsgHdr(aMsgHdr, function (aBody) {
          // Join together the different parts
          let date = (new Date(aMsgHdr.date/1000)).toLocaleString();
          let [{ email, name }] = parseMimeLine(aMsgHdr.mime2DecodedAuthor);
          let author = name || email;
          // The >'s aren't automatically appended, that's what citeString is for.
          let body = citeString("\n"+htmlToPlainText(aBody).trim());
          let txt = ["\n\n",
            "On ", date, ", ", author, " wrote:",
            body
          ].join("");
          // After we removed any trailing newlines, insert it into the textarea
          $("textarea").val($("textarea").val() + txt);
          // I <3 HTML5 selections.
          let node = $("textarea")[0];
          node.selectionStart = 0;
          node.selectionEnd = 0;
        });
      },

      draft: function ({ body }) {
        $("textarea").val(body);
      },
    });
  },

  send: function (options) {
    let self = this;
    let popOut = options && options.popOut;
    this.archive = options && options.archive;
    let $textarea = $("textarea");
    let msg = "Send an empty message?";
    if (!popOut && !$textarea.val().length && !confirm(msg))
      return;

    return sendMessage({
        urls: [msgHdrGetUri(self.params.msgHdr)],
        identity: self.params.identity,
        to: $("#to").val(),
        cc: $("#cc").val(),
        bcc: $("#bcc").val(),
        subject: self.params.subject,
      }, {
        compType: Ci.nsIMsgCompType.ReplyAll,
        deliverType: Ci.nsIMsgCompDeliverMode.Now,
      }, { match: function (x) {
        x.plainText($textarea.val());
      }}, {
        progressListener: progressListener,
        sendListener: sendListener,
        stateListener: createStateListener(self,
          Conversations.currentConversation.msgHdrs,
          Conversations.currentConversation.id
        ),
      }, {
        popOut: popOut,
        archive: self.archive,
      });
  }
};

// ----- Helpers

// Just get the email and/or name from a MIME-style "John Doe <john@blah.com>"
//  line.
function parse(aMimeLine) {
  let emails = {};
  let fullNames = {};
  let names = {};
  let numAddresses = gHeaderParser.parseHeadersWithArray(aMimeLine, emails, names, fullNames);
  return [names.value, emails.value];
}

// ----- Listeners.
//
// These are notified about the outcome of the send process and take the right
//  action accordingly (close window on success, etc. etc.)

function pValue (v) {
  $(".statusPercentage")
    .show()
    .text(v+"%");
  $(".statusThrobber").hide();
}

function pUndetermined () {
  $(".statusPercentage").hide();
  $(".statusThrobber").show();
}

function pText (t) {
  $(".statusMessage").text(t);
}

// all progress notifications are done through the nsIWebProgressListener implementation...
let progressListener = {
  onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {
    Log.debug("onStateChange", aWebProgress, aRequest, aStateFlags, aStatus);
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      pUndetermined();
      $(".quickReplyHeader").show();
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      pValue(0);
      pText('');
    }
  },

  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    Log.debug("onProgressChange", aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
    // Calculate percentage.
    var percent;
    if (aMaxTotalProgress > 0) {
      percent = Math.round( (aCurTotalProgress*100)/aMaxTotalProgress );
      if (percent > 100)
        percent = 100;

      // Advance progress meter.
      pValue(percent);
    } else {
      // Progress meter should be barber-pole in this case.
      pUndetermined();
    }
  },

  onLocationChange: function(aWebProgress, aRequest, aLocation) {
    // we can ignore this notification
  },

  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    pText(aMessage);
  },

  onSecurityChange: function(aWebProgress, aRequest, state) {
    // we can ignore this notification
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIWebProgressListener,
    Ci.nsISupports
  ]),
};

let sendListener = {
  /**
   * Notify the observer that the message has started to be delivered. This method is
   * called only once, at the beginning of a message send operation.
   *
   * @return The return value is currently ignored.  In the future it may be
   * used to cancel the URL load..
   */
  onStartSending: function (aMsgID, aMsgSize) {
    pText("Sending message...");
    $("textarea, #send, #sendArchive").attr("disabled", "disabled");
    Log.debug("onStartSending", aMsgID, aMsgSize);
  },

  /**
   * Notify the observer that progress as occurred for the message send
   */
  onProgress: function (aMsgID, aProgress, aProgressMax) {
    Log.debug("onProgress", aMsgID, aProgress, aProgressMax);
  },

  /**
   * Notify the observer with a status message for the message send
   */
  onStatus: function (aMsgID, aMsg) {
    Log.debug("onStatus", aMsgID, aMsg);
  },

  /**
   * Notify the observer that the message has been sent.  This method is
   * called once when the networking library has finished processing the
   * message.
   *
   * This method is called regardless of whether the the operation was successful.
   * aMsgID   The message id for the mail message
   * status   Status code for the message send.
   * msg      A text string describing the error.
   * returnFileSpec The returned file spec for save to file operations.
   */
  onStopSending: function (aMsgID, aStatus, aMsg, aReturnFile) {
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
      //if (gOldDraftToDelete)
      //  msgHdrsDelete([gOldDraftToDelete]);
      pText("Message "+aMsgID+" sent successfully");
    } else {
      pText("Couldn't send the message.");
      Log.debug("NS_FAILED onStopSending");
    }
  },

  /**
   * Notify the observer with the folder uri before the draft is copied.
   */
  onGetDraftFolderURI: function (aFolderURI) {
    Log.debug("onGetDraftFolderURI", aFolderURI);
  },

  /**
   * Notify the observer when the user aborts the send without actually doing the send
   * eg : by closing the compose window without Send.
   */
  onSendNotPerformed: function (aMsgID, aStatus) {
    Log.debug("onSendNotPerformed", aMsgID, aStatus);
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIMsgSendListener,
    Ci.nsISupports
  ]),
}

let copyListener = {
  onStopCopy: function (aStatus) {
    Log.debug("onStopCopy", aStatus);
    if (NS_SUCCEEDED(aStatus)) {
      //if (gOldDraftToDelete)
      //  msgHdrsDelete(gOldDraftToDelete);
    }
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIMsgCopyServiceListener,
    Ci.nsISupports
  ]),
}

function createStateListener (aComposeSession, aMsgHdrs, aId) {
  return {
    NotifyComposeFieldsReady: function() {
      // ComposeFieldsReady();
    },

    NotifyComposeBodyReady: function() {
      // if (gMsgCompose.composeHTML)
      //   loadHTMLMsgPrefs();
      // AdjustFocus();
    },

    ComposeProcessDone: function(aResult) {
      Log.debug("ComposeProcessDone", NS_SUCCEEDED(aResult));
      if (NS_SUCCEEDED(aResult)) {
        // If the user didn't start a new composition session, hide the quick
        //  reply area, clear draft, collapse.
        if (aComposeSession == gComposeSession) {
          $(".quickReplyHeader").hide();
          $(".quickReply").removeClass('expand');
          $("textarea").val("");
          // We can do this because we're in the right if-block.
          gComposeSession = null;
          gDraftListener.notifyDraftChanged("removed");
        }
        // Remove the old stored draft, don't use onDiscard, because the compose
        //  params might have changed in the meanwhile.
        if (aId)
          SimpleStorage.spin(function () {
            yield ss.remove(aId);
            yield SimpleStorage.kWorkDone;
          });
        // Do stuff to the message we replied to.
        let msgHdr = aComposeSession.params.msgHdr;
        msgHdr.folder.addMessageDispositionState(msgHdr, Ci.nsIMsgFolder.nsMsgDispositionState_Replied);
        msgHdr.folder.msgDatabase = null;
        // Archive the whole conversation if needed
        if (aComposeSession.archive)
          msgHdrsArchive(aMsgHdrs.filter(function (x) !msgHdrIsArchive(x)));
      }
    },

    SaveInFolderDone: function(folderURI) {
      // DisplaySaveFolderDlg(folderURI);
    }
  };
}
