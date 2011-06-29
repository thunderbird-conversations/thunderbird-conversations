/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

var EXPORTED_SYMBOLS = ['Conversation']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource://conversations/log.js");
Cu.import("resource://conversations/prefs.js");

Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/message.js");
Cu.import("resource://conversations/contact.js");
Cu.import("resource://conversations/misc.js"); // for groupArray

let Log = setupLogging("Conversations.Conversation");

const kMsgDbHdr = 0;
const kMsgGloda = 1;

const kActionDoNothing = 0;
const kActionExpand    = 1;
const kActionCollapse  = 2;

const nsMsgViewIndex_None = 0xffffffff;

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
  _runOnceAfterNSignals: function (f, n) {
    if (this._toRun !== null && this._toRun !== undefined)
      Log.error("You failed to call signal enough times. Bad developer, bad! Go fix your code!");
    this._toRun = [f, n+1];
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
}

// The Oracle just decides who to expand and who to scroll into view. As this is
//  quite obscure logic and does not really belong to the main control flow, I
//  thought it would be better to have it in a separate class
//
let OracleMixIn = {
  // Go through all the messages and determine which one is going to be focused
  //  according to the prefs
  _tellMeWhoToScroll: function _Conversation_tellMeWhoToScroll () {
    // Determine which message is going to be scrolled into view
    let needsScroll = -1;
    if (this.scrollMode == Prefs.kScrollUnreadOrLast) {
      needsScroll = this.messages.length - 1;
      for (let i = 0; i < this.messages.length; ++i) {
        if (!this.messages[i].message.read) {
          needsScroll = i;
          break;
        }
      }
    } else if (this.scrollMode == Prefs.kScrollSelected) {
      let gFolderDisplay = topMail3Pane(this).gFolderDisplay;
      let key = msgHdrGetUri(gFolderDisplay.selectedMessage);
      for (let i = 0; i < this.messages.length; ++i) {
        if (this.messages[i].message._uri == key) {
          needsScroll = i;
          break;
        }
      }
      // I can't see why we wouldn't break at some point in the loop below, but
      //  just in case...
      if (needsScroll < 0) {
        Log.error("kScrollSelected && didn't find the selected message");
        needsScroll = this.messages.length - 1;
      }
    } else {
      Log.assert(false, "Unknown value for pref scroll_who");
    }

    return needsScroll;
  },

  // Go through all the messages and for each one of them, give the expected
  //  action
  _tellMeWhoToExpand: function _Conversation_tellMeWhoToExpand (aNeedsFocus) {
    let actions = [];
    let collapse = function _collapse (message) {
      if (message.collapsed)
        actions.push(kActionDoNothing);
      else
        actions.push(kActionCollapse);
    };
    let expand = function _expand (message) {
      if (message.collapsed)
        actions.push(kActionExpand);
      else
        actions.push(kActionDoNothing);
    };
    switch (Prefs["expand_who"]) {
      case Prefs.kExpandAuto:
        // In this mode, we scroll to the first unread message (or the last
        //  message if all messages are read), and we expand all unread messages
        //  + the last one (which will probably be unread as well).
        if (this.scrollMode == Prefs.kScrollUnreadOrLast) {
          for each (let [i, { message }] in Iterator(this.messages)) {
            if (!message.read || i == this.messages.length - 1)
              expand(message);
            else
              collapse(message);
          }
        // In this mode, we scroll to the selected message, and we only expand
        //  the selected message.
        } else if (this.scrollMode == Prefs.kScrollSelected) {
          for each (let [i, { message }] in Iterator(this.messages)) {
            if (i == aNeedsFocus)
              expand(message);
            else
              collapse(message);
          }
        } else {
          Log.assert(false, "Unknown value for pref scroll_who");
        }

        break;
      case Prefs.kExpandAll:
        for each (let [, { message }] in Iterator(this.messages))
          expand(message);
        break;
      case Prefs.kExpandNone:
        for each (let [, { message }] in Iterator(this.messages))
          collapse(message);
        break;
      default:
        Log.assert(false, "Unknown value for pref expand_who");
    }
    return actions;
  },
}

// -- Some helpers for our message type

// Get the message-id of a message, be it a msgHdr or a glodaMsg.
function getMessageId ({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgGloda)
    return glodaMsg.headerMessageID;
  else if (type == kMsgDbHdr)
    return msgHdr.messageId;
  else
    Log.error("Bad message type");
}

// Get the underlying msgHdr of a message. Might return undefined if Gloda
//  remembers dead messages (and YES this happens).
function toMsgHdr ({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgGloda)
    return glodaMsg.folderMessage;
  else if (type == kMsgDbHdr)
    return msgHdr;
  else
    Log.error("Bad message type");
}

// Get a Date instance for the given message.
function msgDate ({ type, message, msgHdr, glodaMsg }) {
  if (type == kMsgDbHdr)
    return new Date(msgHdr.date/1000);
  else if (type == kMsgGloda)
    return new Date(glodaMsg.date);
  else
    Log.error("Bad message type");
}

function msgDebugColor (aMsg) {
  let msgHdr = toMsgHdr(aMsg);
  if (msgHdr) {
    if (msgHdr.getUint32Property("pseudoHdr") == 1)
      return Colors.yellow; // fake sent header
    else
      return Colors.blue; // real header
  } else {
    // red = no message header, shouldn't happen
    return Colors.red;
  }
}

function ViewWrapper(aConversation) {
  this.mainWindow = topMail3Pane(aConversation);
  // The trick is, if a thread is collapsed, this._initialSet contains all the
  //  messages in the thread. We want these to be selected. If a thread is
  //  expanded, we want messages which are in the current view to be selected.
  // We cannot compare messages by message-id (they have the same!), we cannot
  //  compare them by messageKey (not reliable), but URLs should be enough.
  this.byUri = {};
  [this.byUri[msgHdrGetUri(x)] = true
    for each ([, x] in Iterator(this.mainWindow.gFolderDisplay.selectedMessages))];
}

ViewWrapper.prototype = {
  isInView: function _ViewWrapper_isInView(aMsg) {
    if (this.mainWindow.gDBView) {
      let msgHdr = toMsgHdr(aMsg);
      let r =
        (msgHdrGetUri(msgHdr) in this.byUri) ||
        (this.mainWindow.gDBView.findIndexOfMsgHdr(msgHdr, false) != nsMsgViewIndex_None)
      ;
      return r;
    } else {
      return false;
    }
  },
}

// -- The actual conversation object

// We maintain the invariant that, once the conversation is built, this.messages
//  matches exactly the DOM nodes with class "message" inside this._domNode.
// So the i-th _message is also the i-th DOM node.
function Conversation(aWindow, aSelectedMessages, aScrollMode, aCounter) {
  this._contactManager = new ContactManager();
  this._window = aWindow;
  // This is set by the monkey-patch which knows whether we were viewing a
  //  message inside a thread or viewing a closed thread.
  this.scrollMode = aScrollMode;
  // We have the COOL invariant that this._initialSet is a subset of
  //   [toMsgHdr(x) for each ([, x] in Iterator(this.messages))]
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
  // The DOM node that holds all the messages.
  this._domNode = null;
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
}

Conversation.prototype = {
  // Before the Gloda query returns, the user might change selection. Don't
  // output a conversation unless we're really sure the user hasn't changed his
  // mind.
  // XXX this logic is weird. Shouldn't we just compare a list of URLs?
  _selectionChanged: function _Conversation_selectionChanged () {
    let gFolderDisplay = topMail3Pane(this).gFolderDisplay;
    let messageIds = [x.messageId for each ([, x] in Iterator(this._initialSet))];
    return
      !gFolderDisplay.selectedMessage ||
      !messageIds.some(function (x) x == gFolderDisplay.selectedMessage.messageId);
  },

  // This function contains the logic that runs a Gloda query on the initial set
  //  of messages in order to obtain the conversation. It takes care of filling
  //  this.messages with the right set of messages, and then moves on to
  //  _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages () {
    let self = this;
    // This is a "classic query", i.e. the one we use all the time: just obtain
    //  a GlodaMessage for the selected message headers, and then pick the
    //  first one, get its underlying GlodaConversation object, and then ask for
    //  the GlodaConversation's messages.
    let classicQuery = function () {
      Gloda.getMessageCollectionForHeaders(self._initialSet, {
        onItemsAdded: function (aItems) {
          if (!aItems.length) {
            Log.warn("Warning: gloda query returned no messages");
            self._getReady(self._initialSet.length + 1);
            self.messages = [{
                type: kMsgDbHdr,
                message: new MessageFromDbHdr(self, msgHdr), // will run signal
                msgHdr: msgHdr,
                glodaMsg: null,
                debug: "MI+NG", // M = msgHdr, I = Initial, NG = there was no gloda query
              } for each ([, msgHdr] in Iterator(self._initialSet))];
            self._signal();
          } else {
            self._intermediateResults = aItems;
            self._query = aItems[0].conversation.getMessagesCollection(self, true);
          }
        },
        onItemsModified: function () {},
        onItemsRemoved: function () {},
        onQueryCompleted: function (aCollection) {},
      }, null);
    };

    // This is a self-service case. GitHub and GetSatisfaction do not thread
    //  emails related to a common topic, so we're doing it for them. Each
    //  message is in its own conversation: we get all conversations which sport
    //  this exact topic, and then, for each conversation, we get its only
    //  message.
    // All the messages are gathered in fusionItems, which is then used to call
    //  self.onQueryCompleted.
    let fusionCount = -1;
    let fusionItems = [];
    let fusionTop = function () {
      fusionCount--;
      if (fusionCount == 0) {
        if (fusionItems.length)
          self.onQueryCompleted({ items: fusionItems });
        else
          classicQuery();
      }
    };
    let fusionListener =  {
      onItemsAdded: function (aItems) {},
      onItemsModified: function () {},
      onItemsRemoved: function () {},
      onQueryCompleted: function (aCollection) {
        Log.debug("Fusionning", aCollection.items.length, "more items");
        fusionItems = fusionItems.concat(aCollection.items);
        fusionTop();
      }
    };

    // This is the Gloda query to find out about conversations for a given
    //  subject. This relies on our subject attribute provider found in
    //  modules/plugins/glodaAttrProviders.js
    let subjectQuery = function (subject) {
      let query = Gloda.newQuery(Gloda.NOUN_CONVERSATION);
      query.subject(subject);
      query.getCollection({
        onItemsAdded: function (aItems) {},
        onItemsModified: function () {},
        onItemsRemoved: function () {},
        onQueryCompleted: function (aCollection) {
          Log.debug("Custom query found", aCollection.items.length, "items");
          if (aCollection.items.length) {
            for each (let [k, v] in Iterator(aCollection.items)) {
              fusionCount++;
              v.getMessagesCollection(fusionListener);
            }
          }
          fusionTop();
        },
      });
    };

    let firstEmail = this._initialSet.length == 1 && parseMimeLine(this._initialSet[0].author)[0].email;
    switch (firstEmail) {
      case "noreply.mozilla_messaging@getsatisfaction.com": {
        // Special-casing for Roland and his GetSatisfaction emails.
        let subject = this._initialSet[0].mime2DecodedSubject;
        subject = subject.replace(/New (reply|comment): /, "");
        Log.debug("Found a GetSatisfaction message, searching for subject:", subject);
        fusionCount = 3;
        subjectQuery("New reply: "+subject);
        subjectQuery("New comment: "+subject);
        subjectQuery("New question: "+subject);
        break;
      }

      case "noreply@github.com": {
        // Special-casing for me and my GitHub emails
        let subject = this._initialSet[0].mime2DecodedSubject;
        Log.debug("Found a GitHub message, searching for subject:", subject);
        fusionCount = 1;
        subjectQuery(subject);
        break;
      }

      default:
        // This is the regular case.
        classicQuery();
    }
  },

  // This is the observer for the second Gloda query, the one that returns a
  // conversation.
  onItemsAdded: function (aItems) {
    // The first batch of messages will be treated in onQueryCompleted, this
    //  handler is only interested in subsequent messages.
    // If we are an old conversation that hasn't been collected, don't go
    //  polluting some other conversation!
    if (!this.completed || this._window.Conversations.counter != this.counter)
      return;
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    //  bump the version requirements in install.rdf.template (might be fixed in
    //  time for Gecko 42, if we're lucky)
    let self = this;
    this._window.setTimeout(function _Conversation_onQueryCompleted_bug547088 () {
      try {
        // The MessageFromGloda constructor cannot work with gloda messages that
        //  don't have a message header
        aItems = aItems.filter(function (glodaMsg) glodaMsg.folderMessage);
        // We want at least all messages from the Gloda collection
        let messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self, glodaMsg), // will fire signal when done
          glodaMsg: glodaMsg,
          msgHdr: null,
          debug: "GA",
        } for each ([, glodaMsg] in Iterator(aItems))];
        Log.debug("onItemsAdded",
          [msgDebugColor(x) + x.debug + " " + x.glodaMsg.headerMessageID
            for each (x in messages)].join(" "), Colors.default);
        // The message ids we already hold.
        let messageIds = {};
        [messageIds[toMsgHdr(m).messageId] = true
          for each ([i, m] in Iterator(self.messages))];
        // Don't add a message if we already have it.
        messages = messages.filter(function (x) !(x.glodaMsg.headerMessageID in messageIds));
        // Sort all the messages according to the date so that they are inserted
        // in the right order.
        let compare = function (m1, m2) msgDate(m1) - msgDate(m2);
        // We can sort now because we don't need the Message instance to be
        // fully created to get the date of a message.
        messages.sort(compare);
        if (messages.length)
          self.appendMessages(messages);
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, 0);

  },

  onItemsModified: function _Conversation_onItemsModified (aItems) {
    Log.debug("Updating conversation", this.counter, "global state...");
    if (!this.completed)
      return;

    // This updates conversation-wide buttons (the conversation "read" status,
    //  for instance).
    this._updateConversationButtons();

    // Now we forward individual updates to each messages (e.g. tags, starred)
    let byMessageId = {};
    [byMessageId[getMessageId(x)] = x.message
      for each ([, x] in Iterator(this.messages))];
    for each (let [, glodaMsg] in Iterator(aItems)) {
      // If you see big failures coming from the lines below, don't worry: it's
      //  just that an old conversation hasn't been GC'd and still receives
      //  notifications from Gloda. However, its DOM nodes are long gone, so the
      //  call to onAttributesChanged fails.
      let message = byMessageId[glodaMsg.headerMessageID];
      if (message)
        message.onAttributesChanged(glodaMsg);
    }
  },

  onItemsRemoved: function () {},

  onQueryCompleted: function _Conversation_onQueryCompleted (aCollection) {
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    //  bump the version requirements in install.rdf.template (might be fixed in
    //  time for Gecko 42, if we're lucky)
    let self = this;
    this._window.setTimeout(function _Conversation_onQueryCompleted_bug547088 () {
      try {
        // The MessageFromGloda constructor cannot work with gloda messages that
        //  don't have a message header
        aCollection.items = aCollection.items.filter(function (glodaMsg) glodaMsg.folderMessage);
        // In most cases, all messages share the same conversation id (i.e. they
        //  all belong to the same gloda conversations). There are rare cases
        //  where we lie about this: non-strictly threaded messages regrouped
        //  together, special queries for GitHub and GetSatisfaction, etc..
        // Don't really knows what happens in those cases.
        // I've seen cases where we do have intermediate results for the message
        // header but the final collection after filtering has zero items.
        if (aCollection.items.length)
          self.id = aCollection.items[0].conversation.id;
        // Beware, some bad things might have happened in the meanwhile...
        self._initialSet =
          self._initialSet.filter(function (msgHdr) msgHdr && msgHdr.folder.msgDatabase.ContainsKey(msgHdr.messageKey));
        self._intermediateResults =
          self._intermediateResults.filter(function (glodaMsg) glodaMsg.folderMessage);
        // When the right number of signals has been fired, move on...
        self._getReady(aCollection.items.length
          + self._intermediateResults.length
          + self._initialSet.length
          + 1
        );
        // We want at least all messages from the Gloda collection + all
        //  messages from the intermediate set (see rationale in the
        //  initialization of this._intermediateResults).
        self.messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self, glodaMsg), // will fire signal when done
          glodaMsg: glodaMsg,
          msgHdr: null,
          debug: "GF", // G = Gloda, F = Final
        } for each ([, glodaMsg] in Iterator(aCollection.items))
        ].concat([{
          type: kMsgGloda,
          message: new MessageFromGloda(self, glodaMsg), // will fire signal when done
          glodaMsg: glodaMsg,
          msgHdr: null,
          debug: "GM", // G = Gloda, M = interMediate
        } for each ([, glodaMsg] in Iterator(self._intermediateResults))
          if (glodaMsg.folderMessage) // be paranoid
        ]);
        // Here's the message IDs we know
        let messageIds = {};
        [messageIds[m.glodaMsg.headerMessageID] = true
          for each ([i, m] in Iterator(self.messages))];
        // But Gloda might also miss some message headers
        for each (let [, msgHdr] in Iterator(self._initialSet)) {
          // Although _filterOutDuplicates is called eventually, don't uselessly
          //  create messages. The typical use case is when the user has a
          //  conversation selected, a new message arrives in that conversation,
          //  and we get called immediately. So there's only one message gloda
          //  hasn't indexed yet...
          // The extra check should help for cases where the fake header that
          //  represents the sent message has been replaced in the meanwhile
          //  with the real header...
          if (!(msgHdr.messageId in messageIds)) {
            self.messages.push({
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self, msgHdr), // will call signal when done
              msgHdr: msgHdr,
              glodaMsg: null,
              debug: "MI+G", // M = msgHdr, I = Initial, G = there was a gloda query
            });
          } else {
            self._signal();
          }
        }
        // Sort all the messages according to the date so that they are inserted
        // in the right order.
        let compare = function (m1, m2) msgDate(m1) - msgDate(m2);
        // We can sort now because we don't need the Message instance to be
        // fully created to get the date of a message.
        self.messages.sort(compare);
        // Move on! (Actually, will move on when all messages are ready)
        self._signal();
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, 0);
  },

  // This is the function that waits for everyone to be ready (that was a useful
  //  comment)
  _getReady: function _Conversation_getReady(n) {
    let self = this;
    this._runOnceAfterNSignals(function () {
      self._filterOutDuplicates();
      self._outputMessages()
    }, n);
  },

  // This is a core function. It decides which messages to keep and which
  //  messages to filter out. Because Gloda might return many copies of a single
  //  message, each in a different folder, we use the messageId as the key.
  // Then, for different candidates for a single message id, we need to pick the
  //  best one, giving precedence to those which are selected and/or in the
  //  current view.
  _filterOutDuplicates: function _Conversation_filterOutDuplicates () {
    let messages = this.messages;
    let mainWindow = topMail3Pane(this);
    this.viewWrapper = new ViewWrapper(this);
    // Wicked cases, when we're asked to display a draft that's half-saved...
    messages = messages.filter(function (x) (toMsgHdr(x) && toMsgHdr(x).messageId));
    messages = groupArray(this.messages, getMessageId);
    // The message that's selected has the highest priority to avoid
    //  inconsistencies in case multiple identical messages are present in the
    //  same thread (e.g. message from to me).
    let self = this;
    let selectRightMessage = function (aSimilarMessages) {
      let findForCriterion = function (aCriterion) {
        let bestChoice;
        for each (let [i, msg] in Iterator(aSimilarMessages)) {
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
        findForCriterion(function (aMsg) self.viewWrapper.isInView(aMsg)) ||
        findForCriterion(function (aMsg) msgHdrIsInbox(toMsgHdr(aMsg))) ||
        findForCriterion(function (aMsg) msgHdrIsSent(toMsgHdr(aMsg))) ||
        findForCriterion(function (aMsg) !msgHdrIsArchive(toMsgHdr(aMsg))) ||
        aSimilarMessages[0]
      ;
      return r;
    }
    // Select right message will try to pick the message that has an
    //  existing msgHdr.
    messages = [selectRightMessage(group)
      for each ([i, group] in Iterator(messages))];
    // But sometimes it just fails, and gloda remembers dead messages...
    messages = messages.filter(toMsgHdr);
    this.messages = messages;
  },

  removeMessage: function _Conversation_removeMessage (aMessage) {
    // Move the quick reply to the previous message
    let i = [msgHdrGetUri(toMsgHdr(x)) for each ([, x] in Iterator(this.messages))]
      .indexOf(msgHdrGetUri(aMessage._msgHdr));
    Log.debug("Removing message", i);
    if (i == this.messages.length - 1 && this.messages.length > 1) {
      let $ = this._htmlPane.contentWindow.$;
      $(".message:last").prev().append($(".quickReply"));
    }

    let badUri = msgHdrGetUri(aMessage._msgHdr);
    this.messages = this.messages.filter(function (x) msgHdrGetUri(toMsgHdr(x)) != badUri);
    this._initialSet = this._initialSet.filter(function (x) msgHdrGetUri(x) != badUri);
    this._domNode.removeChild(aMessage._domNode);
  },

  // If a new conversation was launched, and that conversation finds out it can
  //  reuse us, it will call this method with the set of messages to append at the
  //  end of this conversation. This only works if the new messages arrive at
  //  the end of the conversation, I don't support the pathological case of new
  //  messages arriving in the middle of the conversation.
  appendMessages: function _Conversation_appendMessages (aMessages) {
    // This is normal, the stupid folder tree view often reflows the
    //  whole thing and asks for a new ThreadSummary but the user hasn't
    //  actually changed selections.
    if (aMessages.length) {
      Log.debug("Appending",
        [msgDebugColor(x) + x.debug for each (x in aMessages)].join(" "), Colors.default);

      // All your messages are belong to us. This is especially important so
      //  that contacts query the right _contactManager through their parent
      //  Message.
      [(x.message._conversation = this) for each ([, x] in Iterator(aMessages))];
      this.messages = this.messages.concat(aMessages);

      let $ = this._htmlPane.contentWindow.$;
      for each (let i in range(0, aMessages.length)) {
        let oldMsg;
        if (i == 0) {
          if (this.messages.length)
            oldMsg = this.messages[this.messages.length - 1].message;
          else
            oldMsg = null;
        } else {
          oldMsg = aMessages[i-1].message;
        }
        let msg = aMessages[i].message;
        msg.updateTmplData(oldMsg);
      }
      let tmplData = [m.message.toTmplData(false)
        for each ([_i, m] in Iterator(aMessages))];
      $("#messageTemplate").tmpl(tmplData).appendTo($(this._domNode));


      // Important: don't forget to move the quick reply part into the last
      //  message.
      $(".quickReply").appendTo($(".message:last"));

      // Notify each message that it's been added to the DOM and that it can do
      //  event registration and stuff...
      let domNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
      for each (let i in range(this.messages.length - aMessages.length, this.messages.length)) {
        this.messages[i].message.initialPosition = i;
        this.messages[i].message.onAddedToDom(domNodes[i]);
        domNodes[i].setAttribute("tabindex", (i+2)+"");
      }
    }

    // Don't forget to update the conversation buttons, even if we have no new
    //  messages: the reflow might be because some message became unread or
    //  whatever.
    try {
      this._updateConversationButtons();
    } catch (e) {
      Log.warn("Failed to update the conversation buttons", e);
      dumpCallStack(e);
    }

    // Re-do the expand/collapse + scroll to the right node stuff. What this
    // means is if: if we just added new messages, don't touch the other ones,
    // and expand/collapse only the newer messages. If we have no new messages,
    // we probably have a different selection in the thread pane, which means we
    // have to redo the expand/collapse.
    if (aMessages.length)
      this._expandAndScroll(this.messages.length - aMessages.length);
    else
      this._expandAndScroll();
    // Update the folder tags, maybe we were called because we changed folders
    this.viewWrapper = new ViewWrapper(this);
    [m.message.inView = this.viewWrapper.isInView(m)
      for each ([, m] in Iterator(this.messages))];
  },

  // Once we're confident our set of messages is the right one, we actually
  // start outputting them inside the DOM element we were given.
  _outputMessages: function _Conversation_outputMessages () {
    // XXX I think this test is still valid because of the thread summary
    // stabilization interval (we might have changed selection and still be
    // waiting to fire the new conversation).
    if (this._selectionChanged()) {
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

    // Try to reuse the previous conversation if possible
    if (this._window.Conversations.currentConversation) {
      let currentMsgSet = this._window.Conversations.currentConversation.messages;
      // We gotta use URIs, because using Message-IDs can create inconsistencies
      //  when different messages with the same Message-ID are present in the
      //  current, expanded thread (breaks the invariant that the selected
      //  message is also the one that's in this.messages).
      // The extra check on valid msgHdrs is required, because some messages
      //  might have been moved / have disappeared in the meanwhile, and if we
      //  throw an exception here, we're fucked, and we can't recover ever,
      //  because every test trying to determine whether we can recycle will end
      //  up running over the buggy set of messages.
      let currentMsgUris = [msgHdrGetUri(toMsgHdr(x))
        for each ([, x] in Iterator(currentMsgSet))
        if (toMsgHdr(x))];
      // Is a1 a prefix of a2? (I wish JS had pattern matching!)
      let isPrefix = function _isPrefix (a1, a2) {
        if (!a1.length) {
          return [true, a2];
        } else if (a1.length && !a2.length) {
          return [false, null];
        } else {
          let hd1 = a1[0];
          let hd2 = a2[0];
          if (hd1 == hd2)
            return isPrefix(a1.slice(1, a1.length), a2.slice(1, a2.length));
          else
            return [false, null];
        }
      };
      let myMsgUris = [msgHdrGetUri(toMsgHdr(x))
        for each ([, x] in Iterator(this.messages))
        if (toMsgHdr(x))];
      let [shouldRecycle, _whichMessageUris] = isPrefix(currentMsgUris, myMsgUris);
      // Ok, some explanation needed. How can this possibly happen?
      // - Click on a conversation
      // - Conversation is built, becomes the global current conversation
      // - The message takes forever to stream (happens...)
      // - User gets fed up, picks another conversation
      // - Bang! Current conversation has no messages.
      // Beware, if the previous conversation's messages have been deleted, we
      //  need to test for currentMsgUri's length, which removes dead msgHdrs,
      //  not just currentMsgset.
      if (currentMsgUris.length == 0)
        shouldRecycle = false;
      if (shouldRecycle) {
        // NB: we get here even if there's 0 new messages, understood?
        // Just get the extra messages
        let whichMessages = this.messages.slice(currentMsgSet.length, this.messages.length);
        let currentConversation = this._window.Conversations.currentConversation;
        // Modify the old conversation in-place. BEWARE: don't forget anything
        Log.debug("Recycling conversation! We are eco-responsible.", whichMessages.length,
          "new messages");
        currentConversation.scrollMode = this.scrollMode;
        currentConversation._initialSet = this._initialSet;
        // - KEEP the old contact manager (we don't want fresh colors!)
        // - KEEP the counter
        // - _domNode, _window are the same because we can only recycle a
        //    conversation from the main mail:3pane
        // - KEEP the _query because it's set to notify currentConversation
        currentConversation._onComplete = this._onComplete;
        // And pass them to the old conversation. It will take care of setting
        // _conversation properly on Message instances.
        currentConversation.appendMessages(whichMessages);

        this.messages = null;
        return;
      } else {
        // We're about to blow up the old conversation. At this point, it's
        //  still untouched, so if you need to save anything, do it NOW.
        // If you want to do something once the new conversation is complete, do
        //  it in monkeypatch.js
        Log.debug("Not recycling conversation");
        // We'll be replacing the old conversation
        this._window.Conversations.currentConversation.messages = [];
        // We don't know yet if this is going to be a junkable conversation, so
        //  when in doubt, reset. Actually, the final call to
        //  _updateConversationButtons will update this.
        this._domNode.ownerDocument.getElementById("conversationHeader")
          .classList.remove("not-junkable");
        // Gotta save the quick reply, if there's one! Please note that
        //  contentWindow.Conversations is still wired onto the old
        //  conversation. Updating the global Conversations object and loading
        //  the new conversation's draft is not our responsibility, it's that of
        //  the monkey-patch, and it's done at the very end of the process.
        // This call actually starts the save process off the main thread, but
        //  we're not doing anything besides saving the quick reply, so we don't
        //  need for this call to complete before going on.
        this._htmlPane.contentWindow.onSave(null, false);
      }
    }

    Log.debug("Outputting",
      [msgDebugColor(x) + x.debug for each (x in this.messages)], Colors.default);
    /*for each (let message in this.messages) {
      let msgHdr = toMsgHdr(message);
      dump("  " + msgHdr.folder.URI + "#" + msgHdr.messageKey + "\n");
    }*/

    // Fill in the HTML right away. The has the nice side-effect of erasing the
    // previous conversation (but not the conversation-wide event handlers!)
    let t0  = (new Date()).getTime();
    let $ = this._htmlPane.contentWindow.$;
    for each (let i in range(0, this.messages.length)) {
      let oldMsg = i > 0 ? this.messages[i-1].message : null;
      let msg = this.messages[i].message;
      msg.updateTmplData(oldMsg);
    }
    let tmplData = [m.message.toTmplData(i == this.messages.length - 1)
      for each ([i, m] in Iterator(this.messages))];
    // We must do this if we are to ever release the previous Conversation
    //  object. See comments in stub.html for the nice details.
    this._htmlPane.contentWindow.cleanup();
    // We need to split the big array in small chunks because jquery-tmpl chokes
    //  on big outputs... Snarky remark: that didn't happen with my innerHTML
    //  solution. On my computer, jquery-tmpl chokes at 93 messages.
    let chunkSize = 50;
    let nChunks = Math.ceil(tmplData.length/chunkSize);
    let chunks = [];
    for (let i = 0; i <= nChunks; ++i) {
      chunks.push(tmplData.slice(i*chunkSize, (i+1)*chunkSize));
    }
    // Go!
    for (let i = 0; i < chunks.length; ++i)
      $("#messageTemplate").tmpl(chunks[i]).appendTo($(this._domNode));

    // Notify each message that it's been added to the DOM and that it can do
    // event registration and stuff...
    let domNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
    for each (let [i, m] in Iterator(this.messages)) {
      m.message.onAddedToDom(domNodes[i]);
      m.message.initialPosition = i;
      // Determine which messages should get a nice folder tag
      m.message.inView = this.viewWrapper.isInView(m);
    }

    // Set the subject properly
    let subjectNode = this._domNode.ownerDocument.getElementsByClassName("subject")[0];
    let subject = this.messages[this.messages.length - 1].message.subject;
    // Clear out the subject node
    while(subjectNode.firstChild) {
      subjectNode.removeChild(subjectNode.firstChild);
    }
    if (LINKS_REGEX.test(subject)) {
      subjectNode.appendChild(linkifySubject(subject, this._domNode.ownerDocument));
    } else {
      subjectNode.textContent = subject || "(no subject)";
    }
    subjectNode.setAttribute("title", subject);
    this._htmlPane.contentWindow.fakeTextOverflowSubject();
    this._htmlPane.contentDocument.title = subject;
    // Invalidate the composition session so that compose-ui.js can setup the
    //  fields next time.
    this._htmlPane.contentWindow.gComposeSession = null;

    // Move on to the next step
    this._expandAndScroll();
  },

  _updateConversationButtons: function _Conversation_updateConversationButtons () {
    // Bail if we're notified too early.
    if (!this.messages || !this.messages.length || !this._domNode)
      return;

    // Make sure the toggle read/unread button is in the right state
    let markReadButton = this._htmlPane.contentDocument.querySelector("span.read");
    if (this.messages.some(function (x) !x.message.read))
      markReadButton.classList.add("unread");
    else
      markReadButton.classList.remove("unread");

    // If some message is collapsed, then the initial state is "expand"
    let collapseExpandButton = this._htmlPane.contentDocument.querySelector("span.expand");
    if (this.messages.some(function (x) x.message.collapsed))
      collapseExpandButton.classList.remove("collapse");
    else
      collapseExpandButton.classList.add("collapse");

    // If we have more than one message, then "junk this message" doesn't make
    //  sense anymore.
    if (this.messages.length > 1 || msgHdrIsJunk(toMsgHdr(this.messages[0])))
      this._domNode.ownerDocument.getElementById("conversationHeader")
        .classList.add("not-junkable");
  },

  // Do all the penible stuff about scrolling to the right message and expanding
  // the right message
  _expandAndScroll: function _Conversation_expandAndScroll (aStart) {
    if (aStart === undefined)
      aStart = 0;
    let focusThis = this._tellMeWhoToScroll();
    let expandThese = this._tellMeWhoToExpand(focusThis);
    let messageNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
    Log.assert(messageNodes.length == this.messages.length, "WTF?");

    let self = this;
    this._runOnceAfterNSignals(function () {
      let focusedNode = messageNodes[focusThis];
      self._htmlPane.contentWindow.scrollNodeIntoView(focusedNode);

      for each (let [i, node] in Iterator(messageNodes)) {
        // XXX This is bug 611957
        if (i >= messageNodes.length)
          break;
        node.setAttribute("tabindex", i+2);
      }
      focusedNode.setAttribute("tabindex", "1");

      // It doesn't matter if it's an update after all, we will just set
      // currentConversation to the same value in the _onComplete handler.
      self._onComplete();
      // _onComplete will potentially set a timeout that, when fired, takes care
      //  of notifying us that we should update the conversation buttons.
    }, this.messages.length);

    for each (let [i, action] in Iterator(expandThese)) {
      // If we were instructed to start operating only after the i-1 messages,
      // don't do anything.
      if (i < aStart) {
        this._signal();
      } else {
        switch (action) {
          case kActionExpand:
            this.messages[i].message.expand();
            break;
          case kActionCollapse:
            this.messages[i].message.collapse();
            this._signal();
            break;
          case kActionDoNothing:
            this._signal();
            break;
          default:
            Log.error("Unknown action");
        }
      }
    }
  },

  // This is the starting point, this is where the Monkey-Patched threadSummary
  // or the event handlers ask for a conversation.
  outputInto: function _Conversation_outputInto (aHtmlPane, k) {
    this._htmlPane = aHtmlPane;
    this._domNode = this._htmlPane.contentDocument.getElementById("messageList");
    this._onComplete = function () k(this);
    this._fetchMessages();
  },

  get msgHdrs () {
    return [toMsgHdr(x) for each ([, x] in Iterator(this.messages)) if (toMsgHdr(x))];
  },

  // Just an efficient way to mark a whole conversation as read
  set read (read) {
    Log.debug(Colors.red, "Marked as read", Colors.default);
    msgHdrsMarkAsRead(this.msgHdrs, read);
  },

  // For the "forward conversation" action
  exportAsHtml: function _Conversation_exportAsHtml () {
    let hr = '<div style="border-top: 1px solid #888; height: 15px; width: 70%; margin: 0 auto; margin-top: 15px">&nbsp;</div>';
    let html = "Here's a conversation I thought you might find interesting!"+hr;
    let messagesHtml = [m.exportAsHtml() for each ({ message: m } in this.messages)];
    html += "<div style=\"font-family: sans-serif !important;\">"+messagesHtml.join(hr)+"</div>";
    Log.debug("\n", html);
    return html;
  },
}

MixIn(Conversation, SignalManagerMixIn);
MixIn(Conversation, OracleMixIn);
