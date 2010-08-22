var EXPORTED_SYMBOLS = ['Conversation']

Cu.import("chrome://conversations/modules/log.js");
const Log = setupLogging();

const kMsgDbHdr = 0;
const kMsgGloda = 1;

function Conversation(aWindow, aSelectedMessages) {
  this._window = aWindow;
  this._initialSet = aSelectedMessages;
  this._messages = [];
  this._query = null;
}

Conversation.prototype = {
  // This function contains the logic that uses Gloda to query a set of messages
  // to obtain the conversation. It takes care of filling this._messages with
  // the right set of messages, and then moves on to _outputMessages.
  _fetchMessages: function _Conversation_fetchMessages () {
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
              message: new MessageFromDbHdr(msgHdr),
              msgHdr: msgHdr,
            } for each ([, msgHdr] in Iterator(this._initialSet))];
          this._outputMessages();
        } else {
          let gmsg = aItems[0];
          this._query = gmsg.conversation.getMessagesCollection(this, true);
        }
      },
      onItemsModified: function () {},
      onItemsRemoved: function () {},
      onQueryCompleted: function (aCollection) { },
    }, true);
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
    setTimeout(function _Conversation_onQueryCompleted_bug547088 () {
      this._messages = [{
        type: kMsgGloda,
        message: new MessageFromGloda(glodaMsg),
        msgHdr: glodaMsg.folderMessage,
      } for each ([, glodaMsg] in Iterator(aCollection.items)];
      this._filterOutDuplicates();
      this._outputMessages();
    } 0);
  },

  // This is a core function. It decides which messages to keep and which
  // messages to filter out. Because Gloda might return many copies of a single
  // message, each in a different folder, we use the messageId as the key.
  _filterOutDuplicates: function _Conversation_filterOutDuplicates () {
  },

  // Once we're confident our set of _messages is the right one, we actually
  // start outputting them inside the DOM element we were given.
  _outputMessages: function _Conversation_outputMessages () {
  },

  // This is the starting point, this is where the Monkey-Patched threadSummary
  // or the event handlers ask for a conversation.
  outputInto: function _Conversation_outputInto (aElement) {
    this._fetchMessages();
  },
}
