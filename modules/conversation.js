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
Cu.import("resource://conversations/contact.js");

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
    //  will trigger a signal the first time. We can safely discard these.
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
      let gFolderDisplay = getMail3Pane().gFolderDisplay;
      let uri = function (msg) msg.folder.getUriForMsg(msg);
      let key = uri(gFolderDisplay.selectedMessage);
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

    Log.debug("Will scroll the following index into view", needsScroll);
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
  this._query = null;
  this._domNode = null;
  this._onComplete = null;
}

Conversation.prototype = {

  // Before the Gloda query returns, the user might change selection. Don't
  // output a conversation unless we're really sure the user hasn't changed his
  // mind.
  // XXX this logic is weird. Shouldn't we just compare a list of URLs?
  _selectionChanged: function _Conversation_selectionChanged () {
    let gFolderDisplay = getMail3Pane().gFolderDisplay;
    let messageIds = [x.messageId for each ([, x] in Iterator(this._initialSet))];
    return
      !gFolderDisplay.selectedMessage ||
      !messageIds.filter(function (x) x == gFolderDisplay.selectedMessage.messageId).length;
  },

  // This function contains the logic that runs a Gloda query on the initial set
  //  of messages in order to obtain the conversation. It takes care of filling
  //  this.messages with the right set of messages, and then moves on to
  //  _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages () {
    let self = this;
    Gloda.getMessageCollectionForHeaders(this._initialSet, {
      onItemsAdded: function (aItems) {
        if (!aItems.length) {
          Log.warn("Warning: gloda query returned no messages"); 
          self._getReady(self._initialSet.length + 1);
          self.messages = [{
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self, msgHdr), // will run signal
              msgHdr: msgHdr,
              glodaMsg: null,
            } for each ([, msgHdr] in Iterator(self._initialSet))];
          self._signal();
        } else {
          self._query = aItems[0].conversation.getMessagesCollection(self, true);
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
    Log.debug("Updating conversation", this.counter, "global state...");

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
        // When the right number of signals has been fired, move on...
        self._getReady(aCollection.items.length + self._initialSet.length + 1);
        // We want at least all messages from the Gloda collection
        self.messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self, glodaMsg), // will fire signal when done
          glodaMsg: glodaMsg,
          msgHdr: null,
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
              message: new MessageFromDbHdr(self, msgHdr), // will call signal when done
              msgHdr: msgHdr,
              glodaMsg: null,
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
    let mainWindow = getMail3Pane();
    // Wicked cases, when we're asked to display a draft that's half-saved...
    messages = messages.filter(function (x) (toMsgHdr(x) && toMsgHdr(x).messageId));
    messages = groupArray(this.messages, getMessageId);
    // The trick is, if a thread is collapsed, this._initialSet contains all the
    //  messages in the thread. We want these to be selected. If a thread is
    //  expanded, we want messages which are in the current view to be selected.
    // We cannot compare messages by message-id (they have the same!), we cannot
    //  compare them by messageKey (not reliable), but URLs should be enough.
    let byUrl = {};
    let url = function (x) x.folder.getUriForMsg(x);
    [byUrl[url(x)] = true
      for each ([, x] in Iterator(this._initialSet))];
    // Ok, this function assumes a specific behavior from selectRightMessage,
    //  that is, that isPreferred is called first and that the search stops as
    //  soon as isPreferred returns true, and the selected message is the one
    //  for which isPreferred said "true".
    let isPreferred = function (aMsg) {
      // NB: selectRightMessage does check for non-null msgHdrs before calling
      //  us.
      let msgHdr = toMsgHdr(aMsg);
      // And a nice side-effect!
      if ((url(msgHdr) in byUrl) ||
          mainWindow.gDBView.findIndexOfMsgHdr(msgHdr, false) != nsMsgViewIndex_None) {
        aMsg.message.inView = true;
        return true;
      } else {
        return false;
      }
    };
    // Select right message will try to pick the message that has an
    //  existing msgHdr.
    messages = [selectRightMessage(group, toMsgHdr, isPreferred)
      for each ([i, group] in Iterator(messages))];
    // But sometimes it just fails, and gloda remembers dead messages...
    messages = messages.filter(toMsgHdr);
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
      // All your messages are belong to us. This is especially important so
      // that contacts query the right _contactManager
      [(x.message._conversation = this) for each ([, x] in Iterator(aMessages))];
      this.messages = this.messages.concat(aMessages);

      let $ = this._htmlPane.contentWindow.$;
      let tmplData = [m.message.toTmplData(false)
        for each ([_i, m] in Iterator(aMessages))];
      $("#messageTemplate").tmpl(tmplData).appendTo($(this._domNode));

      // Notify each message that it's been added to the DOM and that it can do
      //  event registration and stuff...
      let domNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
      for each (let i in range(this.messages.length - aMessages.length, this.messages.length)) {
        Log.debug("Appending node", i, "to the conversation");
        this.messages[i].message.onAddedToDom(domNodes[i]);
        this.messages[i].message.expand();
        Log.debug("Appending message", i, "setting tabindex", i+2);
        domNodes[i].setAttribute("tabindex", (i+2)+"");
      }
    }

    // Don't forget to update the conversation buttons, even if we have no new
    //  messages: the reflow might be because some message became unread or
    //  whatever.
    this._updateConversationButtons();

    // Re-do the expand/collapse + scroll to the right node stuff.
    this._expandAndScroll();
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
      // Ok, some explanation needed. How can this possibly happen?
      // - Click on a conversation
      // - Conversation is built, becomes the global current conversation
      // - The message takes forever to stream (happens...)
      // - User gets fed up, picks another conversation
      // - Bang! Current conversation has no messages.
      if (currentMsgSet.length == 0)
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
        // currentConversation._query = this._query;
        currentConversation._onComplete = this._onComplete;
        // And pass them to the old conversation. It will take care of setting
        // _conversation properly on Message instances.
        currentConversation.appendMessages(whichMessages);

        this.messages = null;
        return;
      } else {
        Log.debug("Not recycling conversation");
        // We'll be replacing the old conversation
        this._window.Conversations.currentConversation.messages = [];
      }
    }

    // Fill in the HTML right away. The has the nice side-effect of erasing the
    // previous conversation (but not the conversation-wide event handlers!)
    // XXX this does not take the "reverse_order" pref into account. Screw this,
    // I'm never going to handle that anyway, it's too fscking complicated.
    let $ = this._htmlPane.contentWindow.$;
    let tmplData = [m.message.toTmplData(i == this.messages.length - 1)
      for each ([i, m] in Iterator(this.messages))];
    // We must do this if we are to ever release the previous Conversation
    //  object. See comments in stub.html for the nice details.
    this._htmlPane.contentWindow.cleanup();
    // Go!
    debugger;
    $("#messageTemplate").tmpl(tmplData).appendTo($(this._domNode));

    // Notify each message that it's been added to the DOM and that it can do
    // event registration and stuff...
    let domNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);
    Log.debug("Got", domNodes.length+"/"+this.messages.length, "dom nodes");
    for each (let [i, m] in Iterator(this.messages))
      m.message.onAddedToDom(domNodes[i]);

    // Set the subject properly
    let subjectNode = this._domNode.ownerDocument.getElementsByClassName("subject")[0];
    let subject = this.messages[0].message.subject;
    subjectNode.textContent = subject || "(no subject)";
    subjectNode.setAttribute("title", subject);
    this._htmlPane.contentWindow.fakeTextOverflowSubject();
    this._htmlPane.contentDocument.title = subject;

    // Move on to the next step
    this._expandAndScroll();
  },

  _updateConversationButtons: function _Conversation_updateConversationButtons () {
    // Bail if we're notified too early.
    if (!this.messages.length || !this._domNode)
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
    let messageNodes = this._domNode.getElementsByClassName(Message.prototype.cssClass);

    let self = this;
    this._runOnceAfterNSignals(function () {
      let focusedNode = messageNodes[focusThis];
      self._htmlPane.contentWindow.scrollNodeIntoView(focusedNode);

      for each (let [i, node] in Iterator(messageNodes)) {
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
    this._domNode = this._htmlPane.contentDocument.getElementById("messageList");
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
