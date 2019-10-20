/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["Conversation", "ConversationUtils"];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  ContactManager: "resource://conversations/modules/contact.js",
  Gloda: "resource:///modules/gloda/gloda.js",
  MailServices: "resource:///modules/MailServices.jsm",
  Prefs: "resource://conversations/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
  StringBundle: "resource:///modules/StringBundle.js",
});

const {Colors, dumpCallStack, setupLogging} =
  ChromeUtils.import("resource://conversations/modules/log.js");

const {msgHdrGetUri, msgHdrIsArchive, msgHdrIsDraft, msgHdrIsInbox,
       msgHdrIsSent, msgHdrsMarkAsRead, msgUriToMsgHdr, msgHdrsArchive,
       msgHdrsDelete} =
  ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
const {MixIn, range, isOSX, isWindows } =
  ChromeUtils.import("resource://conversations/modules/stdlib/misc.js");
const {MessageUtils, MessageFromGloda, MessageFromDbHdr} =
  ChromeUtils.import("resource://conversations/modules/message.js");
const {groupArray, topMail3Pane} =
  ChromeUtils.import("resource://conversations/modules/misc.js");

let Log = setupLogging("Conversations.Conversation");

const kMsgDbHdr = 0;
const kMsgGloda = 1;
const kAllowRemoteContent = 2;

const kHeadersShowAll = 2;

const nsMsgViewIndex_None = 0xffffffff;

let strings = new StringBundle("chrome://conversations/locale/message.properties");

function tenPxFactor() {
  if (isOSX) {
    return .666;
  }
  return isWindows ? .7 : .625;
}

// The SignalManager class handles stuff related to spawing asynchronous
//  requests and waiting for all of them to complete. Basic, but works well.
//  Warning: sometimes yells at the developer.

let SignalManagerMixIn = {
  // Because fetching snippets is possibly asynchronous (in the case of a
  //  MessageFromDbHdr), each message calls "signal" once it's done. After we've
  //  seen N signals pass by, we wait for the N+1-th signal that says that nodes
  //  have all been inserted into the DOM, and then we move on.
  // Once more, we wait for N signals, because message loading is a
  //  asynchronous. Once we've done what's right for each message (expand,
  //  collapse, or do nothing), we do the final cleanup (mark as read, etc.).
  _runOnceAfterNSignals(f, n) {
    if (("_toRun" in this) && this._toRun !== null && this._toRun !== undefined)
      Log.error("You failed to call signal enough times. Bad developer, bad! Go fix your code!");
    this._toRun = [f, n + 1];
    try {
      this._signal();
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
  },

  // This is the helper function that each of the messages is supposed to call.
  _signal: function _Conversation_signal() {
    // This is normal, expanding a message after the conversation has been built
    //  will trigger a signal the first time. We can safely discard these.
    if (!this._toRun)
      return;
    let [f, n] = this._toRun;
    n--;
    if (n == 0) {
      this._toRun = null;
      f();
    } else {
      this._toRun = [f, n];
    }
  },
};

// The Oracle just decides who to expand and who to scroll into view. As this is
//  quite obscure logic and does not really belong to the main control flow, I
//  thought it would be better to have it in a separate class
//
let OracleMixIn = {
  // Go through all the messages and determine which one is going to be focused
  //  according to the prefs
  _tellMeWhoToScroll(messages) {
    // Determine which message is going to be scrolled into view
    let needsScroll = -1;
    if (this.scrollMode == Prefs.kScrollUnreadOrLast) {
      needsScroll = messages.length - 1;
      for (let i = 0; i < messages.length; ++i) {
        if (!messages[i].message.read) {
          needsScroll = i;
          break;
        }
      }
    } else if (this.scrollMode == Prefs.kScrollSelected) {
      let gFolderDisplay = topMail3Pane(this).gFolderDisplay;
      let key = msgHdrGetUri(gFolderDisplay.selectedMessage);
      for (let i = 0; i < messages.length; ++i) {
        if (messages[i].message._uri == key) {
          needsScroll = i;
          break;
        }
      }
      // I can't see why we wouldn't break at some point in the loop below, but
      //  just in case...
      if (needsScroll < 0) {
        Log.error("kScrollSelected && didn't find the selected message");
        needsScroll = messages.length - 1;
      }
    } else {
      Log.assert(false, "Unknown value for kScroll* constant");
    }

    return needsScroll;
  },

  // Go through all the messages and for each one of them, give the expected
  //  action
  _tellMeWhoToExpand(messages, reactMsgData, aNeedsFocus) {
    switch (Prefs.expand_who) {
      case Prefs.kExpandAuto: {
        // In this mode, we scroll to the first unread message (or the last
        //  message if all messages are read), and we expand all unread messages
        //  + the last one (which will probably be unread as well).
        if (this.scrollMode == Prefs.kScrollUnreadOrLast) {
          this.messages.forEach(({ message }, i) => {
            reactMsgData[i].expanded = (!message.read || i == this.messages.length - 1);
          });
        // In this mode, we scroll to the selected message, and we only expand
        //  the selected message.
        } else if (this.scrollMode == Prefs.kScrollSelected) {
          this.messages.forEach(({ message }, i) => {
            reactMsgData[i].expanded = i == aNeedsFocus;
          });
        } else {
          Log.assert(false, "Unknown value for pref scroll_who");
        }
        break;
      }
      case Prefs.kExpandAll: {
        for (const msgData of reactMsgData) {
          msgData.expanded = true;
        }
        break;
      }
      case Prefs.kExpandNone: {
        for (const msgData of reactMsgData) {
          msgData.expanded = false;
        }
        break;
      }
      default: {
        Log.assert(false, "Unknown value for pref expand_who");
      }
    }
  },
};

// -- Some helpers for our message type

// Get the message-id of a message, be it a msgHdr or a glodaMsg.
function getMessageId({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgGloda)
    return glodaMsg.headerMessageID;
  else if (type == kMsgDbHdr)
    return msgHdr.messageId;

  Log.error("Bad message type");
  return null;
}

// Get the underlying msgHdr of a message. Might return undefined if Gloda
//  remembers dead messages (and YES this happens).
function toMsgHdr({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgGloda)
    return glodaMsg.folderMessage;
  else if (type == kMsgDbHdr)
    return msgHdr;

  Log.error("Bad message type");
  return undefined;
}

// Get a Date instance for the given message.
function msgDate({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgDbHdr)
    return new Date(msgHdr.date / 1000);
  else if (type == kMsgGloda)
    return new Date(glodaMsg.date);

  Log.error("Bad message type");
  return new Date();
}

function msgDebugColor(aMsg) {
  let msgHdr = toMsgHdr(aMsg);
  if (msgHdr) {
    if (msgHdr.getUint32Property("pseudoHdr") == 1)
      return Colors.yellow; // fake sent header

    return Colors.blue; // real header
  }
  // red = no message header, shouldn't happen
  return Colors.red;
}

function messageFromGlodaIfOffline(aSelf, aGlodaMsg, aDebug) {
  let aMsgHdr = aGlodaMsg.folderMessage;
  let needsLateAttachments =
    !(aMsgHdr.folder instanceof Ci.nsIMsgLocalMailFolder) &&
      !(aMsgHdr.folder.flags & Ci.nsMsgFolderFlags.Offline) || // online IMAP
    aGlodaMsg.isEncrypted || // encrypted message
    (aGlodaMsg.contentType + "").search(/^multipart\/encrypted(;|$)/i) == 0 || // encrypted message
    Prefs.extra_attachments; // user request
  return {
    type: kMsgGloda,
    message: new MessageFromGloda(aSelf, aGlodaMsg, needsLateAttachments), // will fire signal when done
    glodaMsg: aGlodaMsg,
    msgHdr: null,
    debug: aDebug,
  };
}

function messageFromDbHdr(aSelf, aMsgHdr, aDebug) {
  return {
    type: kMsgDbHdr,
    message: new MessageFromDbHdr(aSelf, aMsgHdr), // will run signal
    msgHdr: aMsgHdr,
    glodaMsg: null,
    debug: aDebug,
  };
}

function ViewWrapper(aConversation) {
  this.mainWindow = topMail3Pane(aConversation);
  // The trick is, if a thread is collapsed, this._initialSet contains all the
  //  messages in the thread. We want these to be selected. If a thread is
  //  expanded, we want messages which are in the current view to be selected.
  // We cannot compare messages by message-id (they have the same!), we cannot
  //  compare them by messageKey (not reliable), but URLs should be enough.
  this.byUri = {};
  if (this.mainWindow.gFolderDisplay.selectedMessages) {
    this.mainWindow.gFolderDisplay.selectedMessages.map(x => this.byUri[msgHdrGetUri(x)] = true);
  }
}

ViewWrapper.prototype = {
  isInView(aMsg) {
    if (this.mainWindow.gDBView) {
      let msgHdr = toMsgHdr(aMsg);
      if (!msgHdr)
        return false;
      let r =
        (msgHdrGetUri(msgHdr) in this.byUri) ||
        (this.mainWindow.gDBView.findIndexOfMsgHdr(msgHdr, false) != nsMsgViewIndex_None)
      ;
      return r;
    }

    return false;
  },
};

class _ConversationUtils {
  markAllAsRead(msgUris, read, withChecks = false) {
    if (!withChecks ||
        Prefs.getBool("mailnews.mark_message_read.auto") ||
        Prefs.getBool("mailnews.mark_message_read.delay")) {
      msgHdrsMarkAsRead(msgUris.map(msg => msgUriToMsgHdr(msg)), read);
    }
  }

  markAsJunk(win, isJunk) {
    win.JunkSelectedMessages(isJunk);
    win.SetFocusThreadPane();
  }

  archive(win, isInTab, msgUris) {
    if (isInTab || Prefs.operate_on_conversations) {
      msgHdrsArchive(msgUris.map(msg => msgUriToMsgHdr(msg)));
      if (!isInTab) {
        win.SetFocusThreadPane();
      }
    } else {
      msgHdrsArchive(win.gFolderDisplay.selectedMessages);
    }
  }

  delete(win, isInTab, msgUris) {
    if (isInTab || Prefs.operate_on_conversations) {
      msgHdrsDelete(msgUris.map(msg => msgUriToMsgHdr(msg)));
      if (isInTab) {
        return true;
      }
      win.SetFocusThreadPane();
    } else {
      msgHdrsDelete(win.gFolderDisplay.selectedMessages);
    }
    return false;
  }

  closeTab(win) {
    const browser = win.frameElement;
    const tabmail = win.top.document.getElementById("tabmail");
    const tabs = tabmail.tabInfo;
    const candidates = tabs.filter(x => x.browser == browser);
    if (candidates.length == 1) {
      tabmail.closeTab(candidates[0]);
    } else {
      Log.error("Couldn't find a tab to close...");
    }
  }

  switchToFolderAndMsg(win, msgUri) {
    const msgHdr = msgUriToMsgHdr(msgUri);
    win.gFolderTreeView.selectFolder(msgHdr.folder, true);
    win.gFolderDisplay.selectMessage(msgHdr);
  }

  sendUnsent(win) {
    if (Services.io.offline) {
      win.MailOfflineMgr.goOnlineToSendMessages(win.msgWindow);
    } else {
      win.SendUnsentMessages();
    }
  }
}

var ConversationUtils = new _ConversationUtils();

// -- The actual conversation object

// We maintain the invariant that, once the conversation is built, this.messages
// matches exactly the DOM nodes with class "message" inside the displayed
// message list.
// So the i-th _message is also the i-th DOM node.
function Conversation(aWindow, aSelectedMessages, aScrollMode, aCounter) {
  this._contactManager = new ContactManager();
  this._window = aWindow;
  // This is set by the monkey-patch which knows whether we were viewing a
  //  message inside a thread or viewing a closed thread.
  this.scrollMode = aScrollMode;
  // We have the COOL invariant that this._initialSet is a subset of
  //   this.messages.map(x => toMsgHdr(x))
  // This is actually trickier than it seems because of the different view modes
  //  and because we can't directly tell whether a message is in the view if
  //  it's under a collapsed thread. See the lengthy discussion in
  //  _filterOutDuplicates
  // The invariant doesn't hold if the same message is present twice in the
  //  thread (like, you sent a message to yourself so it appears twice in your
  //  inbox that also searches sent folders). But we handle that case well.
  this._initialSet = aSelectedMessages;
  // === Our "message" composite type ==
  //
  // this.messages = [
  //  {
  //    type: kMsgGloda or kMsgDbHdr
  //    message: the Message instance (see message.js)
  //    msgHdr: non-null if type == kMsgDbHdr
  //    glodaMsg: non-null if type == kMsgGloda
  //  },
  //  ... (moar messages) ...
  // ]
  this.messages = [];
  this.counter = aCounter; // RO
  // The Gloda query, so that it's not collected.
  this._query = null;
  // Function provided by the monkey-patch to do cleanup
  this._onComplete = null;
  this.viewWrapper = null;
  // Gloda conversation ID
  this.id = null;
  // Set to true by the monkey-patch once the conversation is fully built.
  this.completed = false;
  // Ok, interesting bit. Thunderbird has that non-strict threading thing, i.e.
  //  it will thread messages together if they have a "Green Llama in your car"
  //  "Re: Green Llama in your car" subject pattern, and EVEN THOUGH they do not
  //  have the correct References: header set.
  // Until 2.0alpha2, what we would do is:
  //  - fetch the Gloda message collection,
  //  - pick the first Gloda message, get the message collection for its
  //  underlying conversation,
  //  - merge the results for the conversations with the initially selected set,
  //  - re-stream all other messages except for the first one, because we only
  //  have their nsIMsgDbHdr.
  // That's sub-optimal, because we actually have the other message's Gloda
  //  representations at hand, it's just that because the headers do not set the
  //  threading, gloda hasn't attached them to the first message.
  // The solution is to merge the initial set of messages, the gloda messages
  //  corresponding to the intermediate query, and the initially selected
  //  messages...
  this._intermediateResults = [];
  // For timing purposes
  this.t0 = Date.now();

  this.OS = "linux";
  if (isWindows) {
    this.OS = "windows";
  } else if (isOSX) {
    this.OS = "osx";
  }
}

Conversation.prototype = {
  getMessage(uri) {
    const msg = this.messages.find(m => m.message._uri == uri);
    if (msg) {
      return msg.message;
    }
    return null;
  },

  // TODO: Ideally, the remote content methods would be part of Message,
  // however that currently has no way of triggering a reload of the message.
  showRemoteContent(msgUri) {
    msgUriToMsgHdr(msgUri).setUint32Property("remoteContentPolicy", kAllowRemoteContent);
    const msg = this.getMessage(msgUri);
    // Turn remote content message "off", as although it has it, it can be loaded.
    msg.hasRemoteContent = false;
    // We can't turn dispatch back straight away, so give it a moment.
    Services.tm.dispatchToMainThread(() => {
      const msgData = msg.toReactData();
      this._htmlPane.conversationDispatch({
        type: "MSG_UPDATE_DATA",
        msgData,
      });
    });
  },

  alwaysShowRemoteContent(from, msgUri) {
    const chromeUrl = "chrome://messenger/content/email=" + from;
    const uri = Services.io.newURI(chromeUrl);
    Services.perms.add(uri, "image", Services.perms.ALLOW_ACTION);
    const msg = this.getMessage(msgUri);
    // Turn remote content message "off", as although it has it, it can be loaded.
    msg.hasRemoteContent = false;
    // We can't turn dispatch back straight away, so give it a moment.
    Services.tm.dispatchToMainThread(() => {
      const msgData = msg.toReactData();
      this._htmlPane.conversationDispatch({
        type: "MSG_UPDATE_DATA",
        msgData,
      });
    });
  },

  // Before the Gloda query returns, the user might change selection. Don't
  // output a conversation unless we're really sure the user hasn't changed his
  // mind.
  // XXX this logic is weird. Shouldn't we just compare a list of URLs?
  _selectionChanged: function _Conversation_selectionChanged() {
    let gFolderDisplay = topMail3Pane(this).gFolderDisplay;
    let messageIds = this._initialSet.map(x => x.messageId);
    return !gFolderDisplay.selectedMessage ||
           !messageIds.some(x => x == gFolderDisplay.selectedMessage.messageId);
  },

  // This function contains the logic that runs a Gloda query on the initial set
  //  of messages in order to obtain the conversation. It takes care of filling
  //  this.messages with the right set of messages, and then moves on to
  //  _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages() {
    let self = this;
    // This is a "classic query", i.e. the one we use all the time: just obtain
    //  a GlodaMessage for the selected message headers, and then pick the
    //  first one, get its underlying GlodaConversation object, and then ask for
    //  the GlodaConversation's messages.
    Gloda.getMessageCollectionForHeaders(self._initialSet, {
      onItemsAdded(aItems) {
        if (!aItems.length) {
          Log.warn("Warning: gloda query returned no messages");
          self._getReady(self._initialSet.length + 1);
          // M = msgHdr, I = Initial, NG = there was no gloda query
          // will run signal
          self.messages = self._initialSet.map(msgHdr =>
            messageFromDbHdr(self, msgHdr, "MI+NG")
          );
          self._signal();
        } else {
          self._intermediateResults = aItems;
          self._query = aItems[0].conversation.getMessagesCollection(self, true);
        }
      },
      onItemsModified() {},
      onItemsRemoved() {},
      onQueryCompleted(aCollection) {},
    }, null);
  },

  // This is the observer for the second Gloda query, the one that returns a
  // conversation.
  onItemsAdded(aItems) {
    // The first batch of messages will be treated in onQueryCompleted, this
    //  handler is only interested in subsequent messages.
    // If we are an old conversation that hasn't been collected, don't go
    //  polluting some other conversation!
    if (!this.completed || this._window.Conversations.counter != this.counter)
      return;
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    //  bump the version requirements in install.rdf.template (might be fixed in
    //  time for Gecko 42, if we're lucky)
    // SO LOLZ: the comment above was written in 2011, Gecko 42 has been
    //  released, bug still isn't fixed.
    Services.tm.dispatchToMainThread(() => {
      try {
        // The MessageFromGloda constructor cannot work with gloda messages that
        //  don't have a message header
        aItems = aItems.filter(glodaMsg => glodaMsg.folderMessage);
        // We want at least all messages from the Gloda collection
        // will fire signal when done
        let messages = aItems.map(glodaMsg => messageFromGlodaIfOffline(this, glodaMsg, "GA"));
        Log.debug("onItemsAdded",
          messages.map(x => msgDebugColor(x) + x.debug + " " + getMessageId(x)).join(" "),
          Colors.default);
        Log.debug(this.messages.length, "messages already in the conversation");
        // The message ids we already hold.
        let messageIds = {};
        // Remove all messages which don't have a msgHdr anymore
        for (let message of this.messages) {
          if (!toMsgHdr(message)) {
            Log.debug("Removing a message with no msgHdr");
            this.removeMessage(message.message);
          }
        }
        this.messages.map(m => {
          messageIds[getMessageId(m)] = !toMsgHdr(m) || msgHdrIsDraft(toMsgHdr(m));
        });
        // If we've got a new header for a message that we used to know as a
        // draft, that means either the draft has been updated (autosave), or
        // the draft was actually sent. In both cases, we want to remove the old
        // draft.
        for (let x of messages) {
          let newMessageId = getMessageId(x);
          if (messageIds[newMessageId]) {
            Log.debug("Removing a draft...");
            let draft = this.messages.filter(y =>
              getMessageId(y) == newMessageId
            )[0];
            this.removeMessage(draft.message);
            delete messageIds[newMessageId];
          }
        }
        // Don't add a message if we already have it.
        messages = messages.filter(x => !(getMessageId(x) in messageIds));
        // Sort all the messages according to the date so that they are inserted
        // in the right order.
        let compare = (m1, m2) => msgDate(m1) - msgDate(m2);
        // We can sort now because we don't need the Message instance to be
        // fully created to get the date of a message.
        messages.sort(compare);
        if (messages.length)
          this.appendMessages(messages);
      } catch (e) {
        console.error(e);
        Log.error(e);
        dumpCallStack(e);
      }
    });
  },

  onItemsModified(aItems) {
    Log.debug("Updating conversation", this.counter, "global state...");
    if (!this.completed)
      return;

    const byMessageId = new Map();
    for (const x of this.messages) {
      byMessageId.set(getMessageId(x), x.message);
    }
    for (const glodaMsg of aItems) {
      // If you see big failures coming from the lines below, don't worry: it's
      //  just that an old conversation hasn't been GC'd and still receives
      //  notifications from Gloda. However, its DOM nodes are long gone, so the
      //  calls fail.
      const message = byMessageId.get(glodaMsg.headerMessageID);
      if (message) {
        const msgData = message.toReactData();
        this._htmlPane.conversationDispatch({
          type: "MSG_UPDATE_DATA",
          msgData,
        });
      }
    }
  },

  onItemsRemoved(aItems) {
    Log.debug("Updating conversation", this.counter, "global state...");
    if (!this.completed)
      return;

    // We (should) have the invariant that a conversation only has one message
    // with a given Message-Id.
    let byMessageId = {};
    for (let x of this.messages) {
      byMessageId[getMessageId(x)] = x.message;
    }
    for (let glodaMsg of aItems) {
      let msgId = glodaMsg.headerMessageID;
      if ((msgId in byMessageId) && byMessageId[msgId]._msgHdr.messageKey == glodaMsg.messageKey)
        this.removeMessage(byMessageId[msgId]);
    }
  },

  onQueryCompleted(aCollection) {
    // We'll receive this notification waaaay too many times, so if we've
    // already settled on a set of messages, let onItemsAdded handle the rest.
    // This is just for the initial building of the conversation.
    if (this.messages.length)
      return;
    // Report!
    let delta = Date.now() - this.t0;
    try {
      let h = Services.telemetry.getHistogramById("THUNDERBIRD_CONVERSATIONS_TIME_TO_2ND_GLODA_QUERY_MS");
      h.add(delta);
    } catch (e) {
      Log.debug("Unable to report telemetry", e);
    }
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    //  bump the version requirements in install.rdf.template (might be fixed in
    //  time for Gecko 42, if we're lucky)
    Services.tm.dispatchToMainThread(() => {
      try {
        // The MessageFromGloda constructor cannot work with gloda messages that
        //  don't have a message header
        aCollection.items = aCollection.items.filter(glodaMsg => glodaMsg.folderMessage);
        // In most cases, all messages share the same conversation id (i.e. they
        //  all belong to the same gloda conversations). There are rare cases
        //  where we lie about this: non-strictly threaded messages regrouped
        //  together, special queries for GitHub and GetSatisfaction, etc..
        // Don't really knows what happens in those cases.
        // I've seen cases where we do have intermediate results for the message
        // header but the final collection after filtering has zero items.
        if (aCollection.items.length)
          this.id = aCollection.items[0].conversation.id;
        // Beware, some bad things might have happened in the meanwhile...
        this._initialSet =
          this._initialSet.filter(msgHdr => msgHdr && msgHdr.folder.msgDatabase.ContainsKey(msgHdr.messageKey));
        this._intermediateResults =
          this._intermediateResults.filter(glodaMsg => glodaMsg.folderMessage);
        // When the right number of signals has been fired, move on...
        this._getReady(aCollection.items.length
          + this._intermediateResults.length
          + this._initialSet.length
          + 1
        );
        // We want at least all messages from the Gloda collection + all
        //  messages from the intermediate set (see rationale in the
        //  initialization of this._intermediateResults).
        // will fire signal when done
        this.messages =
          aCollection.items.map(glodaMsg => messageFromGlodaIfOffline(this, glodaMsg, "GF"));
        let intermediateSet =
          this._intermediateResults.filter(glodaMsg => glodaMsg.folderMessage)
                                   .map(glodaMsg => messageFromGlodaIfOffline(this, glodaMsg, "GM"));
        this.messages = this.messages.concat(intermediateSet);
        // Here's the message IDs we know
        let messageIds = {};
        for (let m of this.messages) {
          messageIds[getMessageId(m)] = true;
        }
        // But Gloda might also miss some message headers
        for (let msgHdr of this._initialSet) {
          // Although _filterOutDuplicates is called eventually, don't uselessly
          //  create messages. The typical use case is when the user has a
          //  conversation selected, a new message arrives in that conversation,
          //  and we get called immediately. So there's only one message gloda
          //  hasn't indexed yet...
          // The extra check should help for cases where the fake header that
          //  represents the sent message has been replaced in the meanwhile
          //  with the real header...
          if (!(msgHdr.messageId in messageIds)) {
            // Will call signal when done.
            this.messages.push(messageFromDbHdr(this, msgHdr, "MI+G"));
          } else {
            this._signal();
          }
        }
        // Sort all the messages according to the date so that they are inserted
        // in the right order.
        let compare = (m1, m2) => msgDate(m1) - msgDate(m2);
        // We can sort now because we don't need the Message instance to be
        // fully created to get the date of a message.
        this.messages.sort(compare);
        // Move on! (Actually, will move on when all messages are ready)
        this._signal();
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    });
  },

  // This is the function that waits for everyone to be ready (that was a useful
  //  comment)
  _getReady: function _Conversation_getReady(n) {
    this._runOnceAfterNSignals(() => {
      this._filterOutDuplicates();
      this._outputMessages();
    }, n);
  },

  // This is a core function. It decides which messages to keep and which
  //  messages to filter out. Because Gloda might return many copies of a single
  //  message, each in a different folder, we use the messageId as the key.
  // Then, for different candidates for a single message id, we need to pick the
  //  best one, giving precedence to those which are selected and/or in the
  //  current view.
  _filterOutDuplicates() {
    let messages = this.messages;
    this.viewWrapper = new ViewWrapper(this);
    // Wicked cases, when we're asked to display a draft that's half-saved...
    messages = messages.filter(x => (toMsgHdr(x) && getMessageId(x)));
    messages = groupArray(this.messages, getMessageId);
    // The message that's selected has the highest priority to avoid
    //  inconsistencies in case multiple identical messages are present in the
    //  same thread (e.g. message from to me).
    let selectRightMessage = (aSimilarMessages) => {
      let findForCriterion = (aCriterion) => {
        let bestChoice;
        for (let msg of aSimilarMessages) {
          if (!toMsgHdr(msg))
            continue;
          if (aCriterion(msg)) {
            bestChoice = msg;
            break;
          }
        }
        return bestChoice;
      };
      let r =
        findForCriterion(aMsg => this.viewWrapper.isInView(aMsg)) ||
        findForCriterion(aMsg => msgHdrIsInbox(toMsgHdr(aMsg))) ||
        findForCriterion(aMsg => msgHdrIsSent(toMsgHdr(aMsg))) ||
        findForCriterion(aMsg => !msgHdrIsArchive(toMsgHdr(aMsg))) ||
        aSimilarMessages[0]
      ;
      return r;
    };
    // Select right message will try to pick the message that has an
    //  existing msgHdr.
    messages = messages.map(group => selectRightMessage(group));
    // But sometimes it just fails, and gloda remembers dead messages...
    messages = messages.filter(toMsgHdr);
    this.messages = messages;
  },

  /**
   * Remove a given message from the conversation.
   * @param {Message} msg a Message as in modules/message.js
   */
  removeMessage(msg) {
    Log.debug("Removing message", msg);
    // Move the quick reply to the previous message
    this.messages = this.messages.filter(x => x.message != msg);
    this._initialSet = this._initialSet.filter(x => x.message != msg);

    // TODO As everything is synchronous but react doesn't let us dispatch
    // from within a dispatch, then we have to dispatch this off to the main
    // thread.
    Services.tm.dispatchToMainThread(() => {
      this._htmlPane.conversationDispatch({
        type: "REMOVE_MESSAGE_FROM_CONVERSATION",
        msgUri: msg._uri,
      });
    });
  },

  // If a new conversation was launched, and that conversation finds out it can
  //  reuse us, it will call this method with the set of messages to append at the
  //  end of this conversation. This only works if the new messages arrive at
  //  the end of the conversation, I don't support the pathological case of new
  //  messages arriving in the middle of the conversation.
  appendMessages(aMessages) {
    // This is normal, the stupid folder tree view often reflows the
    //  whole thing and asks for a new ThreadSummary but the user hasn't
    //  actually changed selections.
    if (!aMessages.length) {
      return;
    }

    Log.debug("Appending",
      aMessages.map(x => msgDebugColor(x) + x.debug).join(" "), Colors.default);

    // All your messages are belong to us. This is especially important so
    //  that contacts query the right _contactManager through their parent
    //  Message.
    for (let x of aMessages) {
      x.message._conversation = this;
    }
    this.messages = this.messages.concat(aMessages);

    for (let i of range(0, aMessages.length)) {
      let oldMsg;
      if (i == 0) {
        if (this.messages.length)
          oldMsg = this.messages[this.messages.length - 1].message;
        else
          oldMsg = null;
      } else {
        oldMsg = aMessages[i - 1].message;
      }
      let msg = aMessages[i].message;
      msg.updateTmplData(oldMsg);
    }
    // Update initialPosition
    for (let i of range(this.messages.length - aMessages.length, this.messages.length)) {
      this.messages[i].message.initialPosition = i;
    }
    this.viewWrapper = new ViewWrapper(this);
    const reactMsgData = aMessages.map(m => {
      const msgData = m.message.toReactData();
      // inView indicates if the message is currently in the message list
      // view or not. If it isn't we don't show the folder tags.
      m.message.inView = this.viewWrapper.isInView(m);
      return msgData;
    });

    let w = this._htmlPane;
    w.markReadInView.disable();
    // Re-do the expand/collapse + scroll to the right node stuff. What this
    // means is if: if we just added new messages, don't touch the other ones,
    // and expand/collapse only the newer messages.
    // TODO:
    //   this._expandAndScroll(this.messages.length - aMessages.length);

    w.conversationDispatch({
      type: "APPEND_MESSAGES",
      msgData: reactMsgData,
    });
  },

  // Once we're confident our set of messages is the right one, we actually
  // start outputting them inside the DOM element we were given.
  _outputMessages() {
    // XXX I think this test is still valid because of the thread summary
    // stabilization interval (we might have changed selection and still be
    // waiting to fire the new conversation).
    if (!this._htmlPane.isInTab && this._selectionChanged()) {
      Log.debug("Selection changed, aborting...");
      return;
    }
    // In some pathological cases, the folder tree view will fire two consecutive
    //  thread summaries very fast. This will MITIGATE race conditions, not solve
    //  them. To solve them, we would need to make sure the two lines below are
    //  atomic.
    // This happens sometimes for drafts, a conversation is fired for the old
    //  thread, a message in the thread is replaced, a new conversation is
    //  fired. If the old conversation is conversation #2, and the new one is
    //  conversation #3, then #3 succeeds and then #2 succeeds. In that case,
    //  #2 gives up at that point.
    // The invariant is that if one conversation has been fired while we were
    //  fetching our messages, we give up, which implies that #3's output takes
    //  precedence. If #3 decided to reuse an old conversation, it necessarily
    //  reused conversation #1, because currentConversation is only set when a
    //  conversation reaches completion (and #2 never reaches completion).
    // I hope I will understand this when I read it again in a few days.
    if (this._window.Conversations.counter != this.counter) {
      Log.debug("Race condition,", this.counter, "dying for", this._window.Conversations.counter);
      return;
    }

    if (this._window.Conversations.currentConversation) {
      // Gotta save the quick reply, if there's one! Please note that
      //  contentWindow.Conversations is still wired onto the old
      //  conversation. Updating the global Conversations object and loading
      //  the new conversation's draft is not our responsibility, it's that of
      //  the monkey-patch, and it's done at the very end of the process.
      // This call actually starts the save process off the main thread, but
      //  we're not doing anything besides saving the quick reply, so we don't
      //  need for this call to complete before going on.
      try {
        // TODO: Re-enable this.
        // this._htmlPane.onSave();
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
      // We'll be replacing the old conversation. Do this after the call to
      // onSave, because onSave calls getMessageForQuickReply...
      this._window.Conversations.currentConversation.messages = [];
    }

    Log.debug("Outputting",
      this.messages.map(x => msgDebugColor(x) + x.debug), Colors.default);
    Log.debug(this.messages.length, "messages in the conversation now");

    // Fill in the HTML right away. The has the nice side-effect of erasing the
    // previous conversation (but not the conversation-wide event handlers!)
    for (let i of range(0, this.messages.length)) {
      // We need to set this before the call to reactMsgData.
      let msg = this.messages[i].message;
      msg.initialPosition = i;

      let oldMsg = i > 0 ? this.messages[i - 1].message : null;
      msg.updateTmplData(oldMsg);
    }
    const shouldShowHeaders = Prefs.getInt("mail.show_headers") == kHeadersShowAll;

    const reactMsgData = this.messages.map((m, i) => {
      const msgData = m.message.toReactData();
      // inView indicates if the message is currently in the message list
      // view or not. If it isn't we don't show the folder name.
      msgData.inView = this.viewWrapper.isInView(m);
      msgData.initialPosition = i;
      // This is a new display of a conversation, so ensure we don't display
      // the detailed view of the header unless the user wants us to.
      msgData.detailsShowing = shouldShowHeaders;
      return msgData;
    });

    // Move on to the next step
    this._expandAndScroll(this.messages, reactMsgData);

    // If we're showing message hdr details, then get them here so we're ready
    // when we first display.
    if (shouldShowHeaders) {
      for (const msg of reactMsgData) {
        Services.tm.dispatchToMainThread(() => {
          MessageUtils.getMsgHdrDetails(this._htmlPane, msg.msgUri);
        });
      }
    }

    this._htmlPane.conversationDispatch({
      type: "REPLACE_CONVERSATION_DETAILS",
      summary: {
        conversation: this,
        subject: this.messages[this.messages.length - 1].message.subject,
        loading: false,
        prefs: {
          defaultFontSize: Prefs.getInt("font.size.variable.x-western"),
          browserForegroundColor: Prefs.getChar("browser.display.foreground_color"),
          browserBackgroundColor: Prefs.getChar("browser.display.background_color"),
          hideSigs: Prefs.hide_sigs,
          hideQuoteLength: Prefs.hide_quote_length,
          tenPxFactor: tenPxFactor(),
          tweakBodies: Prefs.tweak_bodies,
          tweakChrome: Prefs.tweak_chrome,
        },
        OS: this.OS,
      },
      messages: {
        msgData: reactMsgData,
      },
    });
    // Invalidate the composition session so that compose-ui.js can setup the
    //  fields next time.
    this._htmlPane.gComposeSession = null;

    // Now tell the monkeypatch that we've queued everything up.
    Services.tm.dispatchToMainThread(() => this._onComplete());
  },

  // Do all the penible stuff about scrolling to the right message and expanding
  // the right message
  _expandAndScroll(messages, reactMsgData, aStart) {
    if (aStart === undefined)
      aStart = 0;
    let focusThis = this._tellMeWhoToScroll(messages);
    reactMsgData[focusThis].scrollTo = true;
    // let expandThese =
    this._tellMeWhoToExpand(messages, reactMsgData, focusThis);
    // let messageNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
    // Log.assert(messageNodes.length == this.messages.length, "WTF?");

    // let self = this;
    // this._runOnceAfterNSignals(function() {
    //   let focusedNode = messageNodes[focusThis];
    //   self.messages[focusThis].message.onSelected();
    //
    //   Array.prototype.forEach.call(messageNodes, function(node, i) {
    //     if (i < messageNodes.length) {
    //       node.setAttribute("tabindex", i + 2);
    //     }
    //   });
    //   focusedNode.setAttribute("tabindex", "1");
    //
    //   // It doesn't matter if it's an update after all, we will just set
    //   // currentConversation to the same value in the _onComplete handler.
    //   self._onComplete();
    //   // _onComplete will potentially set a timeout that, when fired, takes care
    //   //  of notifying us that we should update the conversation buttons.
    //
    //   let w = self._htmlPane;
    //   if (Prefs.getBool("mailnews.mark_message_read.auto") &&
    //       !Prefs.getBool("mailnews.mark_message_read.delay")) {
    //     w.markReadInView.enable();
    //   } else {
    //     w.markReadInView.disable();
    //   }
    // }, this.messages.length);
  },

  // This is the starting point, this is where the Monkey-Patched threadSummary
  // or the event handlers ask for a conversation.
  outputInto(aHtmlPane, k) {
    this._htmlPane = aHtmlPane;
    this._onComplete = () => k(this);
    this._fetchMessages();
  },

  get msgHdrs() {
    return this.messages.filter(x => toMsgHdr(x)).map(x => toMsgHdr(x));
  },

  // Just an efficient way to mark a whole conversation as read
  set read(read) {
    Log.debug(Colors.red, "Marked as read", Colors.default);
    msgHdrsMarkAsRead(this.msgHdrs, read);
  },

  forward() {
    let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                    .createInstance(Ci.nsIMsgCompFields);
    fields.characterSet = "UTF-8";
    fields.bodyIsAsciiOnly = false;
    fields.forcePlainText = false;
    this.exportAsHtml(function(html) {
      fields.body = html;
      let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                      .createInstance(Ci.nsIMsgComposeParams);
      params.format = Ci.nsIMsgCompFormat.HTML;
      params.composeFields = fields;
      return MailServices.compose.OpenComposeWindowWithParams(null, params);
    });
  },

  // For the "forward conversation" action
  exportAsHtml(k) {
    // Somehow this seems to be needed... why? Dunno.
    let start = "<html><body>";
    let hr = '<div style="border-top: 1px solid #888; height: 15px; width: 70%; margin: 0 auto; margin-top: 15px">&nbsp;</div>';
    let html = start + "<p>" + strings.get("conversationFillInText") + "</p>" + hr;
    let count = 1;
    let top = function() {
      if (!--count) {
        html += "<div style=\"font-family: sans-serif !important;\">" + messagesHtml.join(hr) + "</div>";
        Log.debug("The HTML: ---------\n", html, "\n\n");
        k(html);
      }
    };
    let messagesHtml = new Array(this.messages.length);
    this.messages.forEach(function({ message: message }, i) {
      let j = i;
      count++;
      message.exportAsHtml(function(aHtml) {
        messagesHtml[j] = aHtml;
        top();
      });
    });
    top();
  },
};

MixIn(Conversation, SignalManagerMixIn);
MixIn(Conversation, OracleMixIn);
