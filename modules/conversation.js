var EXPORTED_SYMBOLS = ['Conversation']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource://conversations/log.js");
Cu.import("resource://conversations/prefs.js");

Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/message.js");

const kMsgDbHdr = 0;
const kMsgGloda = 1;

const kActionDoNothing = 0;
const kActionExpand    = 1;
const kActionCollapse  = 2;

// The SignalManager class handles stuff related to spawing asynchronous
// requests and waiting for all of them to complete. Basic, but works well.
// Warning: sometimes yells at the developer.

let SignalManagerMixIn = {
  // Because fetching snippets is possibly asynchronous (in the case of a
  // MessageFromDbHdr), each message calls "signal" once it's done. After we've
  // seen N signals pass by, we wait for the N+1-th signal that says that nodes
  // have all been inserted into the DOM, and then we move on.
  //
  // Once again, we wait for N signals, because message loading is a
  // asynchronous. Once we've done what's right for each message (expand,
  // collapse, or do nothing), we do the final cleanup (mark as read, etc.).
  _runOnceAfterNSignals: function (f, n) {
    Log.debug("Will wait for", n, "signals");
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
    // will trigger a signal the first time. We can safely discard these.
    if (!this._toRun)
      return;
    let [f, n] = this._toRun;
    n--;
    if (n == 0) {
      Log.debug("Signal dispatch complete, running f...");
      this._toRun = null;
      f();
    } else {
      this._toRun = [f, n];
    }
  },
}

// The Oracle just decides who to expand and who to scroll into view. As this is
// quite obscure logic and does not really belong to the main control flow, I
// thought it would be better to have it in a separate class
//
let OracleMixIn = {
  // Go through all the messages and determine which one is going to be focused
  // according to the prefs
  _tellMeWhoToScroll: function _Conversation_tellMeWhoToScroll () {
    // Determine which message is going to be Scrolled
    let needsScroll = -1;
    if (Prefs["scroll_who"] == Prefs.kScrollUnreadOrLast) {
      needsScroll = this.messages.length - 1;
      for (let i = 0; i < this.messages.length; ++i) {
        if (!this.messages[i].message.read) {
          needsScroll = i;
          break;
        }
      }
    } else if (Prefs["scroll_who"] == Prefs.kScrollSelected) {
      let uri = function (msg) msg.folder.getUriForMsg(msg);
      let key = uri(gFolderDisplay.selectedMessage);
      for (let i = 0; i < this.messages.length; ++i) {
        if (this.messages[i].message._uri == key) {
          needsScroll = i;
          break;
        }
      }
    } else {
      Log.error("Unknown value for pref scroll_who");
    }

    Log.debug("Will scroll the following index into view", needsScroll);
    return needsScroll;
  },

  // Go through all the messages and for each one of them, give the expected
  // action
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
      case Prefs.kExpandScrolled:
        for each (let [i, { message }] in Iterator(this.messages)) {
          if (i == aNeedsFocus)
            expand(message);
          else
            collapse(message);
        }
        break;
      case Prefs.kExpandUnreadAndLast:
        for each (let [i, { message }] in Iterator(this.messages)) {
          if (!message.read || i == this.messages.length - 1)
            expand(message);
          else
            collapse(message);
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
        Log.error("Unknown value for pref expand_who");
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

// -- The actual conversation object

// We maintain the invariant that, once the conversation is built, this.messages
//  matches exactly the DOM nodes with class "message" inside this._domElement.
// So the i-th _message is also the i-th DOM node.
function Conversation(aWindow, aSelectedMessages, aCounter) {
  this._window = aWindow;
  // We have the COOL invariant that this._initialSet is a subset of
  //   [toMsgHdr(x) for each ([, x] in Iterator(this.messages))]
  // This is made possible by David's patch in bug 572094 that allows us to
  //  always favor the message that's in the current view (and I'm not talking
  //  of the current folder) in VariousUtils.jsm:selectRightMessage()
  this._initialSet = aSelectedMessages;
  // this.messages = [
  //  {
  //    type: kMsgGloda or kMsgDbHdr
  //    message: the Message instance (see message.js)
  //    msgHdr: non-null if type == kMsgDbHdr
  //    glodaMsg: non-null if type == kMsgGloda
  //  },
  //  ...
  // ]
  this.messages = [];
  this.counter = aCounter; // RO
  this._query = null;
  this._domElement = null;
  this._onComplete = null;
}

Conversation.prototype = {

  // Before the Gloda query returns, the user might change selection. Don't
  // output a conversation unless we're really sure the user hasn't changed his
  // mind.
  _selectionChanged: function _Conversation_selectionChanged () {
    let gFolderDisplay = this._window.gFolderDisplay;
    let messageIds = [x.messageId for each ([, x] in Iterator(this._initialSet))];
    return
      !gFolderDisplay.selectedMessage ||
      !(gFolderDisplay.selectedMessage.messageId in messageIds);
  },

  // This function contains the logic that uses Gloda to query a set of messages
  // to obtain the conversation. It takes care of filling this.messages with
  // the right set of messages, and then moves on to _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages () {
    let self = this;
    Gloda.getMessageCollectionForHeaders(this._initialSet, {
      onItemsAdded: function (aItems) {
        if (!aItems.length) {
          Log.warn("Warning: gloda query returned no messages"); 
          self._getReady(self._initialSet.length + 1);
          self.messages = [{
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self._window, self._htmlPane,
                function () self._signal.apply(self), msgHdr), // will run signal
              msgHdr: msgHdr,
            } for each ([, msgHdr] in Iterator(self._initialSet))];
          self._signal();
        } else {
          let gmsg = aItems[0];
          self._query = gmsg.conversation.getMessagesCollection(self, true);
        }
      },
      onItemsModified: function () {},
      onItemsRemoved: function () {},
      onQueryCompleted: function (aCollection) { },
    }, null);
  },

  // This is the observer for the second Gloda query, the one that returns a
  // conversation.
  onItemsAdded: function () {},

  onItemsModified: function _Conversation_onItemsModified (aItems) {
    this._updateConversationButtons();
    // TODO dispatch info to Message instances accordingly (new tags, starred
    //  status)...
  },

  onItemsRemoved: function () {},

  onQueryCompleted: function _Conversation_onQueryCompleted (aCollection) {
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    //  bump the version requirements in install.rdf.template (this will
    //  probably be fixed in time for Gecko 8, if we're lucky)
    let self = this;
    this._window.setTimeout(function _Conversation_onQueryCompleted_bug547088 () {
      try {
        // The MessageFromGloda constructor cannot work with gloda messages that
        //  don't have a message header
        aCollection.items = aCollection.items.filter(function (glodaMsg) glodaMsg.folderMessage);
        // When the right number of signals has been fired, move on...
        self._getReady(aCollection.items.length + self._initialSet.length + 1);
        // We want at least all messages from the Gloda collection
        self.messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self._window, self._htmlPane,
            function () self._signal.apply(self), glodaMsg), // will fire signal when done
          glodaMsg: glodaMsg,
        } for each ([, glodaMsg] in Iterator(aCollection.items))];
        // Here's the message IDs we know
        let messageIds = {};
        [messageIds[m.glodaMsg.headerMessageID] = true
          for each ([i, m] in Iterator(self.messages))];
        // But Gloda might also miss some message headers
        for each (let [, msgHdr] in Iterator(self._initialSet)) {
          // Although _filterOutDuplicates is called eventually, don't uselessly
          // create messages. The typical use case is when the user has a
          // conversation selected, a new message arrives in that conversation,
          // and we get called immediately. So there's only one message gloda
          // hasn't indexed yet...
          if (!(messageIds[msgHdr.messageId])) {
            Log.debug("Message with message-id", msgHdr.messageId, "was not in the gloda collection");
            self.messages.push({
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self._window, self._htmlPane,
                function () self._signal.apply(self), msgHdr), // will call signal when done
              msgHdr: msgHdr,
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
  _filterOutDuplicates: function _Conversation_filterOutDuplicates () {
    let messages = this.messages;
    // Wicked cases, when we're asked to display a draft that's half-saved...
    messages = messages.filter(function (x) (toMsgHdr(x) && toMsgHdr(x).messageId));
    messages = groupArray(this.messages, getMessageId);
    // Select right message will try to pick the message that has an
    //  existing msgHdr.
    let self = this;
    let getThread = function (aMsgHdr) {
      try {
        return self._window.gDBView.getThreadContainingMsgHdr(aMsgHdr);
      } catch (e) {
        return -1;
      }
    };
    let msgHdrToThreadKey = function (aMsgHdr) getThread(aMsgHdr).threadKey;
    let threadKey = msgHdrToThreadKey(this._initialSet[0]);
    messages = [selectRightMessage(group, toMsgHdr, threadKey, msgHdrToThreadKey)
      for each ([i, group] in Iterator(messages))];
    // But sometimes it just fails, and gloda remembers dead messages...
    messages = messages.filter(function (x) x.msgHdr || (x.glodaMsg && x.glodaMsg.folderMessage));
    this.messages = messages;
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
      // All your messages are belong to us.
      this.messages = this.messages.concat(aMessages);

      // We can't do this._domElement.innerHTML += because it will recreate all
      //  previous elements and reset all iframes (that's obviously bad!). It's ok
      //  to use a div since we're using getElementsByClassName everywhere.
      let innerHtml = [m.message.toHtmlString()
        for each ([_i, m] in Iterator(aMessages))];
      innerHtml = innerHtml.join("\n");
      let div = this._domElement.ownerDocument.createElement("div");
      this._domElement.appendChild(div);
      div.innerHTML = innerHtml;

      // Notify each message that it's been added to the DOM and that it can do
      //  event registration and stuff...
      let domNodes = this._domElement.getElementsByClassName(Message.prototype.cssClass);
      for each (let i in range(this.messages.length - aMessages.length, this.messages.length)) {
        Log.debug("Appending node", i, "to the conversation");
        this.messages[i].message.onAddedToDom(domNodes[i]);
        this.messages[i].message.expand();
      }

      // XXX add some visual feedback, like "1 new message in this conversation"
    }

    // Don't forget to update the conversation buttons, even if we have no new
    //  messages: the reflow might be because some message became unread or
    //  whatever.
    this._updateConversationButtons();
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
      //Log.debug("Race condition,", this.counter, "dying for", this._window.Conversations.counter);
      return;
    }

    // Try to reuse the previous conversation if possible
    if (this._window.Conversations.currentConversation) {
      let currentMsgSet = this._window.Conversations.currentConversation.messages;
      let currentMsgIds = [getMessageId(x) for each ([, x] in Iterator(currentMsgSet))];
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
      let myMsgIds = [getMessageId(x) for each ([, x] in Iterator(this.messages))];
      let [shouldRecycle, _whichMessageIds] = isPrefix(currentMsgIds, myMsgIds);
      if (currentMsgSet.length == 0) {
        // Seems to happen sometimes. Why? Dunno. XXX investigate this
        Log.error("Empty conversation, WTF?");
        shouldRecycle = false;
      }
      if (shouldRecycle) {
        // Just get the extra messages
        let whichMessages = this.messages.slice(currentMsgSet.length, this.messages.length);
        let currentConversation = this._window.Conversations.currentConversation;
        // And pass them to the old conversation
        Log.debug("Recycling conversation! We are eco-responsible.", whichMessages.length,
          "new messages");
        currentConversation.appendMessages(whichMessages);

        this.messages = null;
        // Don't call k (i.e. don't mark the newly arrived messages as read and
        // keep the old conversation as the current one), don't blow away the
        // previous conversation, don't do anything. Goodbye!
        return;
      } else {
        // We'll be replacing the old conversation
        this._window.Conversations.currentConversation.messages = [];
      }
    }

    // Fill in the HTML right away. The has the nice side-effect of erasing the
    // previous conversation (but not the conversation-wide event handlers!)
    // XXX this does not take the "reverse_order" pref into account. Screw this,
    // I'm never going to handle that anyway, it's too fscking complicated.
    let innerHtml = [m.message.toHtmlString()
      for each ([i, m] in Iterator(this.messages))];
    innerHtml = innerHtml.join("\n");
    this._domElement.innerHTML = innerHtml;

    // Notify each message that it's been added to the DOM and that it can do
    // event registration and stuff...
    let domNodes = this._domElement.getElementsByClassName(Message.prototype.cssClass);
    Log.debug("Got", domNodes.length+"/"+this.messages.length, "dom nodes");
    for each (let [i, m] in Iterator(this.messages))
      m.message.onAddedToDom(domNodes[i]);

    // Set the subject properly
    let subjectNode = this._domElement.ownerDocument.getElementsByClassName("subject")[0];
    subjectNode.textContent = this.messages[0].message.subject;
    subjectNode.setAttribute("title", this.messages[0].message.subject);
    this._htmlPane.contentWindow.fakeTextOverflowSubject();

    // Move on to the next step
    this._expandAndScroll();
  },

  _updateConversationButtons: function _Conversation_updateConversationButtons () {
    Log.debug("Updating conversation", this.counter, "global state...");
    if (!this.messages.length)
      return;

    // Make sure the toggle read/unread button is in the right state
    let markReadButton = this._htmlPane.contentDocument.querySelector("span.read");
    if (this.messages.filter(function (x) !x.message.read).length)
      markReadButton.classList.add("unread");
    else
      markReadButton.classList.remove("unread");

    // If some message is collapsed, then the initial state is "expand"
    let collapseExpandButton = this._htmlPane.contentDocument.querySelector("span.expand");
    if (this.messages.filter(function (x) x.message.collapsed).length)
      collapseExpandButton.classList.remove("collapse");
    else
      collapseExpandButton.classList.add("collapse");
  },

  // Do all the penible stuff about scrolling to the right message and expanding
  // the right message
  _expandAndScroll: function _Conversation_expandAndScroll () {
    let focusThis = this._tellMeWhoToScroll();
    let expandThese = this._tellMeWhoToExpand(focusThis);

    let self = this;
    this._runOnceAfterNSignals(function () {
      self._htmlPane.contentWindow.scrollNodeIntoView(
        self._domElement.getElementsByClassName(Message.prototype.cssClass)[focusThis]);

      self._onComplete();
      // In theory, we could call this *before* _onComplete, and pray for Gloda
      //  to call onItemsModified properly, and in time. We could. But we won't.
      self._updateConversationButtons();
    }, this.messages.length);

    for each (let [i, action] in Iterator(expandThese)) {
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
  },

  // This is the starting point, this is where the Monkey-Patched threadSummary
  // or the event handlers ask for a conversation.
  outputInto: function _Conversation_outputInto (aHtmlPane, k) {
    this._htmlPane = aHtmlPane;
    this._domElement = this._htmlPane.contentDocument.getElementById("messageList");
    this._onComplete = function () k(this);
    this._fetchMessages();
  },

  get msgHdrs () {
    return [toMsgHdr(x) for each ([, x] in Iterator(this.messages))];
  },

  // Just an efficient way to mark a whole conversation as read
  set read (read) {
    msgHdrsMarkAsRead(this.msgHdrs, read);
  },
}

MixIn(Conversation, SignalManagerMixIn);
MixIn(Conversation, OracleMixIn);
