var EXPORTED_SYMBOLS = ['Conversation']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource://conversations/log.js");
Cu.import("resource://conversations/prefs.js");
const Log = setupLogging();

Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/message.js");

const kMsgDbHdr = 0;
const kMsgGloda = 1;

const kActionDoNothing = 0;
const kActionExpand = 1;
const kActionCollapse = 2;

// We maintain the invariant that, once the conversation is built, this._messages
// matches exactly the DOM nodes with class "message" inside this._domElement
function Conversation(aWindow, aSelectedMessages) {
  this._window = aWindow;
  this._initialSet = aSelectedMessages;
  // this._messages = [
  //  {
  //    type: one of the consts above
  //    message: the Message instance
  //    msgHdr: non-null if type == kMsgDbHdr
  //    glodaMsg: non-null if type == kMsgGloda
  //  },
  //  ...
  // ]
  this._messages = [];
  this._query = null;
  this._domElement = null;
  this._toRun = null;
  this._onComplete = null;
}

Conversation.prototype = {
  // This function contains the logic that uses Gloda to query a set of messages
  // to obtain the conversation. It takes care of filling this._messages with
  // the right set of messages, and then moves on to _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages () {
    let self = this;
    Gloda.getMessageCollectionForHeaders(this._initialSet, {
      onItemsAdded: function (aItems) {
        if (!aItems.length) {
          if (self._selectionChanged()) {
            Log.debug("Selection changed, aborting...");
            return;
          }
          Log.warn("Warning: gloda query returned no messages"); 
          self._getReady(self._initialSet.length);
          self._messages = [{
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self._window, self._htmlPane,
                function () self._signal.apply(self), msgHdr),
              msgHdr: msgHdr,
            } for each ([, msgHdr] in Iterator(self._initialSet))];
          self._outputMessages();
        } else {
          let gmsg = aItems[0];
          this._query = gmsg.conversation.getMessagesCollection(self, true);
        }
      },
      onItemsModified: function () {},
      onItemsRemoved: function () {},
      onQueryCompleted: function (aCollection) { },
    }, null);
  },

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

  // This is the observer for the second Gloda query, the one that returns a
  // conversation.
  onItemsAdded: function () {},
  onItemsModified: function _Conversation_onItemsModified (aItems) {
    // TODO dispatch info to Message instances accordingly
  },
  onItemsRemoved: function () {},
  onQueryCompleted: function _Conversation_onQueryCompleted (aCollection) {
    if (this._selectionChanged()) {
      Log.debug("Selection changed, aborting...");
      return;
    }
    // That's XPConnect bug 547088, so remove the setTimeout when it's fixed and
    // bump the version requirements in install.rdf.template
    let self = this;
    this._window.setTimeout(function _Conversation_onQueryCompleted_bug547088 () {
      try {
        self._getReady(aCollection.items.length);
        self._messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self._window, self._htmlPane,
            function () self._signal.apply(self), glodaMsg),
          glodaMsg: glodaMsg,
        } for each ([, glodaMsg] in Iterator(aCollection.items))];
        self._filterOutDuplicates();
        self._outputMessages();
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, 0);
  },

  // This is a core function. It decides which messages to keep and which
  // messages to filter out. Because Gloda might return many copies of a single
  // message, each in a different folder, we use the messageId as the key.
  _filterOutDuplicates: function _Conversation_filterOutDuplicates () {
    let getMessageId = function ({ type, message, msgHdr, glodaMsg }) {
      if (type == kMsgGloda)
        return glodaMsg.headerMessageID;
      else if (type == kMsgDbHdr)
        return msgHdr.messageId;
      else
        Log.error("Malformed item in this._messages!");
    };
    let toMsgHdr = function ({ type, message, msgHdr, glodaMsg }) {
      if (type == kMsgGloda)
        return glodaMsg.folderMessage;
      else if (type == kMsgDbHdr)
        return msgHdr;
      else
        Log.error("Malformed item in this._messages!");
    };

    let messages = groupArray(this._messages, getMessageId);
    messages = [selectRightMessage(group, this._window.gDBView.msgFolder, toMsgHdr)
      for each ([i, group] in Iterator(messages))];
    // Gloda might still remember dead messages
    messages = messages.filter(function (x) x.msgHdr || (x.glodaMsg && x.glodaMsg.folderMessage));
    this._messages = messages;
  },

  // This is the function that waits for everyone to be ready
  _getReady: function _Conversation_getReady(n) {
    // Count 1 for each snippet that's ready (hopefully, these are Gloda
    // messages and it is instantaneous) and add 1 inserting the HTML into the
    // DOM
    let self = this;
    this._runOnceAfterNSignals(function () self._expandAndScroll(), n+1);
  },

  // Once we're confident our set of _messages is the right one, we actually
  // start outputting them inside the DOM element we were given.
  _outputMessages: function _Conversation_outputMessages () {
    Log.debug("Outputting", this._messages.length, "messages...");

    // Fill in the HTML right away. The has the nice side-effect of erasing the
    // previous conversation (but not the conversation-wide event handlers!)
    let innerHtml = [m.message.toHtmlString()
      for each ([i, m] in Iterator(this._messages))];
    innerHtml = innerHtml.join("\n");
    this._domElement.innerHTML = innerHtml;

    // Notify each message that it's been added to the DOM and that it can do
    // event registration and stuff...
    let domNodes = this._domElement.getElementsByClassName(Message.prototype.cssClass);
    Log.debug("Got", domNodes.length, "dom nodes");
    for each (let [i, m] in Iterator(this._messages))
      m.message.onAddedToDom(domNodes[i]);

    // Set the subject properly
    this._domElement.ownerDocument.getElementsByClassName("subject")[0].textContent =
      this._messages[0].message.subject;

    // Make sure we wait for the DOM to be ready before moving on
    this._signal();
  },

  _runOnceAfterNSignals: function (f, n) {
    Log.debug("Will wait for", n, "signals");
    if (this._toRun !== null)
      Log.error("You failed to call signal enough times. Bad developer, bad! Go fix your code!");
    this._toRun = [f, n+1];
    try {
      this._signal();
    } catch (e) {
      Log.error(e);
      dumpCallStack(e);
    }
  },

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

  // Go through all the messages and determine which one is going to be focused
  // according to the prefs
  _tellMeWhoToScroll: function _Conversation_tellMeWhoToScroll () {
    // Determine which message is going to be Scrolled
    let needsScroll = -1;
    if (Prefs["scroll_who"] == Prefs.kScrollUnreadOrLast) {
      needsScroll = this._messages.length - 1;
      for (let i = 0; i < this._messages.length; ++i) {
        if (!this._messages[i].message.read) {
          needsScroll = i;
          break;
        }
      }
    } else if (Prefs["scroll_who"] == Prefs.kScrollSelected) {
      let uri = function (msg) msg.folder.getUriForMsg(msg);
      let key = uri(gFolderDisplay.selectedMessage);
      for (let i = 0; i < this._messages.length; ++i) {
        if (this._messages[i].message._uri == key) {
          needsScroll = i;
          break;
        }
      }
    } else {
      Log.error("Unknown value for pref scroll_who");
    }

    Log.debug(this._messages.length, " messages total, scrolling ", needsScroll);
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
        for each (let [i, { message }] in Iterator(this._messages)) {
          if (i == aNeedsFocus)
            expand(message);
          else
            collapse(message);
        }
        break;
      case Prefs.kExpandUnreadAndLast:
        for each (let [i, { message }] in Iterator(this._messages)) {
          if (!message.read || i == this._messages.length - 1)
            expand(message);
          else
            collapse(message);
        }
        break;
      case Prefs.kExpandAll:
        for each (let [, { message }] in Iterator(this._messages))
          expand(message);
        break;
      case Prefs.kExpandNone:
        for each (let [, { message }] in Iterator(this._messages))
          collapse(message);
        break;
      default:
        Log.error("Unknown value for pref expand_who");
    }
    return actions;
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
    }, this._messages.length);

    for each (let [i, action] in Iterator(expandThese)) {
      switch (action) {
        case kActionExpand:
          this._messages[i].message.expand();
          break;      
        case kActionCollapse:
          this._messages[i].message.collapse();
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
    this._fetchMessages();
    this._onComplete = k;
  },

  set read (read) {
    msgHdrsMarkAsRead([m.message._msgHdr for each ([, m] in Iterator(this._messages))], read);
  },
}

function createOrRecycleConversation(aWindow, aSelectedMessages) {
  // TODO: poke into aWindow.Conversations.currentConversation, and see if
  // the conversation we obtain from aSelectedMessages is a superset of the
  // current conversation's messages. In that case, just add a method to
  // Conversation (addMessage), and add the messages with the right indexes, and
  // make sure we maintain the invariant that Conversation._messages reflects
  // exactly what's in the DOM (we might need to wrap the new message inside an
  // extra <div>)
}
