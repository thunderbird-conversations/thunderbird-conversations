var EXPORTED_SYMBOLS = ['Conversation']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource://conversations/log.js");
const Log = setupLogging();

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/message.js");

const kMsgDbHdr = 0;
const kMsgGloda = 1;

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
  this._count = 0;
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
          if (this._selectionChanged()) {
            Log.debug("Selection changed, aborting...");
            return;
          }
          Log.warn("Warning: gloda query returned no messages"); 
          this._messages = [{
              type: kMsgDbHdr,
              message: new MessageFromDbHdr(self._window, function () self._signal(), msgHdr),
              msgHdr: msgHdr,
            } for each ([, msgHdr] in Iterator(this._initialSet))];
          this._outputMessages();
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
        self._messages = [{
          type: kMsgGloda,
          message: new MessageFromGloda(self._window, function () self._signal(), glodaMsg),
          glodaMsg: glodaMsg,
        } for each ([, glodaMsg] in Iterator(aCollection.items))];
        self._filterOutDuplicates();
        self._outputMessages();
        self._expandAndScroll();
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

  // Once we're confident our set of _messages is the right one, we actually
  // start outputting them inside the DOM element we were given.
  _outputMessages: function _Conversation_outputMessages () {
    Log.debug("Outputting", this._messages.length, "messages...");
    let innerHtml = [m.message.toHtmlString()
      for each ([i, m] in Iterator(this._messages))];
    innerHtml = innerHtml.join("\n");
    this._domElement.innerHTML = innerHtml;
    let domNodes = this._domElement.getElementsByClassName(Message.prototype.cssClass);
    Log.debug("Got", domNodes.length, "dom nodes");
    for each (let [i, m] in Iterator(this._messages))
      m.message.onAddedToDom(domNodes[i]);
  },

  _signal: function _Conversation_signal() {
    Log.debug("Count is now", ++this._count);
  },

  // Do all the penible stuff about scrolling to the right message and expanding
  // the right message
  _expandAndScroll: function _Conversation_expandAndScroll () {
    Log.warn("Not implemented: Conversation._expandAndScroll");
  },

  // This is the starting point, this is where the Monkey-Patched threadSummary
  // or the event handlers ask for a conversation.
  outputInto: function _Conversation_outputInto (aElement) {
    this._domElement = aElement;
    this._fetchMessages();
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
