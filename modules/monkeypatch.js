var EXPORTED_SYMBOLS = ['MonkeyPatch']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.MonkeyPatch");

function MonkeyPatch(aWindow, aConversation) {
  this._Conversation = aConversation;
  this._wantedUrl = "";
  this._window = aWindow;
  this._markReadTimeout = null;
}

MonkeyPatch.prototype = {

  clearTimer: function () {
    // If we changed conversations fast, clear the timeout
    if (this.markReadTimeout)
      this._window.clearTimeout(this.markReadTimeout);
  },

  apply: function () {
    let window = this._window;
    let self = this;
    let htmlpane = window.document.getElementById("multimessage");
    let oldSummarizeMultipleSelection = window["summarizeMultipleSelection"];

    // This nice little wrapper makes sure that the multimessagepane points to
    //  the given URL before moving on. It takes a continuation, and an optional
    //  third arguments that is to be run in case we loaded a fresh page.
    let ensureLoadedAndRun = function (aLocation, k, onRefresh) {
      if (htmlpane.contentDocument.location.href == aLocation) {
        k();
      } else {
        htmlpane.addEventListener("load", function _g (event) {
          htmlpane.removeEventListener("load", _g, true);
            if (onRefresh)
              onRefresh();
            k();
        }, true);
        htmlpane.contentDocument.location.href = aLocation;
      }
    };

    window.summarizeMultipleSelection =
      function _summarizeMultiple_patched (aSelectedMessages, aListener) {
        ensureLoadedAndRun("chrome://messenger/content/multimessageview.xhtml", function () {
          oldSummarizeMultipleSelection(aSelectedMessages, aListener);
        });
      };

    // This one completely nukes the original summarizeThread function, which is
    //  actually the entry point to the original ThreadSummary class.
    window.summarizeThread =
      function _summarizeThread_patched (aSelectedMessages, aListener) {
        if (!aSelectedMessages.length)
          return;

        ensureLoadedAndRun("chrome://conversations/content/stub.html", function () {
          try {
            let freshConversation = new self._Conversation(
              window, aSelectedMessages, ++window.Conversations.counter);
            freshConversation.outputInto(htmlpane, function (aConversation) {
              // One nasty behavior of the folder tree view is that it calls us
              //  every time a new message has been downloaded. So if you open
              //  your inbox all of a sudden and select a conversation, it's not
              //  uncommon to see the conversation being rebuilt 5 times in a
              //  row because sumarizeThread is constantly re-called.
              // To workaround this, even though we create a fresh conversation,
              //  that conversation might end up recycling the old one as long
              //  as the old conversation's message set is a prefix of that of
              //  the new conversation. So because we're not sure
              //  freshConversation will actually end up being used, we take the
              //  new conversation as parameter.
              // The conversation knows what this callback is all about, and
              //  will decide not to call it if recycling a previous
              //  conversation (so that kind of defeats what I'm saying above).
              Log.debug("Conversation", aConversation.counter, "is the new one.");
              window.Conversations.currentConversation = aConversation;
              // Make sure we respect the user's preferences.
              self.markReadTimeout = window.setTimeout(function () {
                aConversation.read = true;
                self.markReadTimeout = null;
              }, Prefs.getInt("mailnews.mark_message_read.delay.interval")
                * Prefs.getBool("mailnews.mark_message_read.delay") * 1000);
            });
            // Make sure we have a global root --> conversation --> persistent
            //  query chain to prevent the Conversation object (and its inner
            //  query) to be collected. The Conversation keeps watching the
            //  Gloda query for modified items (read/unread, starred, tags...).
          } catch (e) {
            Log.error(e);
            dumpCallStack(e);
          }
        }, function () {
          // Invalidate any remaining conversation
          window.Conversations.currentConversation = null;
        });
      };

    // Because we want to replace the standard message reader, we need to always
    //  fire up the conversation view instead of deferring to the regular
    //  display code. The trick is that re-using the original function's name
    //  allows us to intercept the calls to the thread summary in regular
    //  situations (where a normal thread summary would kick in) as a
    //  side-effect. That means we don't need to hack into gMessageDisplay too
    //  much.
    window.document.getElementById("tabmail")
        .tabInfo[0].messageDisplay.onSelectedMessagesChanged =
      function _onSelectedMessagesChanged_patched () {
        try {
          if (!this.active)
            return true;
          window.ClearPendingReadTimer();
          self.clearTimer();

          let selectedCount = this.folderDisplay.selectedCount;
          Log.debug("Intercepted message load, ", selectedCount, " message(s) selected");

          if (selectedCount == 0) {
            this.clearDisplay();
            // Once in our lifetime is plenty.
            if (!this._haveDisplayedStartPage) {
              window.loadStartPage(false);
              this._haveDisplayedStartPage = true;
            }
            this.singleMessageDisplay = true;
            return true;

          } else if (selectedCount == 1) {
            // Here starts the part where we modify the original code.
            let msgHdr = this.folderDisplay.selectedMessage;
            // XXX unused right now
            let wantedUrl = self._wantedUrl;
            self._wantedUrl = null;

            // We can't display NTTP messages and RSS messages properly yet, so
            // leave it up to the standard message reader. If the user explicitely
            // asked for the old message reader, we give up as well.
            if (msgHdrIsRss(msgHdr) || msgHdrIsNntp(msgHdr) ||
                wantedUrl == msgHdrToNeckoURL(msgHdr).spec) {
              Log.debug("Don't want to handle this message, deferring");
              // Use the default pref.
              self.markReadTimeout = window.setTimeout(function () {
                msgHdrsMarkAsRead([msgHdr], true);
                self.markReadTimeout = null;
              }, Prefs.getInt("mailnews.mark_message_read.delay.interval")
                * Prefs.getBool("mailnews.mark_message_read.delay") * 1000);
              this.singleMessageDisplay = true;
              return false;
            } else {
              // Otherwise, we create a thread summary.
              // We don't want to call this._showSummary because it has a built-in check
              // for this.folderDisplay.selectedCount and returns immediately if
              // selectedCount == 1
              Log.debug("Handling this message, firing summarizeThread");
              this.singleMessageDisplay = false;
              window.summarizeThread(this.folderDisplay.selectedMessages, this);
              return true;
            }
          }

          // Else defer to showSummary to work it out based on thread selection.
          // (This might be a MultiMessageSummary after all!)
          Log.debug("This is a real multiple selection, deferring to _showSummary()");
          return this._showSummary();
        } catch (e) {
          Log.error(e);
          dumpCallStack(e);
        }
      };

    // Ok, this is slightly tricky. The C++ code notifies the global msgWindow
    //  when content has been blocked, and we can't really afford to just
    //  replace the code, because that would defeat the standard reader (e.g. in
    //  a new tab). So we must find the message in the conversation and notify
    //  it if needed.
    let oldOnMsgHasRemoteContent = window.messageHeaderSink.onMsgHasRemoteContent;
    window.messageHeaderSink.onMsgHasRemoteContent = function _onMsgHasRemoteContent_patched (aMsgHdr) {
      let msgListeners = window.Conversations.msgListeners;
      let messageId = aMsgHdr.messageId;
      if (messageId in msgListeners) {
        for each (let [i, listener] in Iterator(msgListeners[messageId])) {
          let obj = listener.get();
          if (obj)
            obj.onMsgHasRemoteContent();
          else
            Log.debug("Yay! Weak references actually work.");
        }
        msgListeners[messageId] = msgListeners[messageId].filter(function (x) (x != null));
      }
      // Wicked case: we have the conversation and another tab with a message
      //  from the conversation in that tab. So to be safe, forward the call.
      oldOnMsgHasRemoteContent(aMsgHdr);
    };

    Log.debug("Monkey patch successfully applied.");
  },

  // XXX dead
  expectUrl: function (aUrl) {
    Log.debug("Expecting "+aUrl+" to be loaded soon");
    this._wantedUrl = aUrl;
  },

}
