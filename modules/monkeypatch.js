var EXPORTED_SYMBOLS = ['MonkeyPatch']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/log.js");

const Log = setupLogging();

function MonkeyPatch(aWindow, aConversation) {
  this._Conversation = aConversation;
  this._wantedUrl = "";
  this._window = aWindow;
}

MonkeyPatch.prototype = {

  apply: function () {
    let window = this._window;
    let self = this;
    let htmlpane = window.document.getElementById("multimessage");

    // This one completely nukes the original summarizeThread function, which is
    // actually the entry point to the original ThreadSummary class.
    window.summarizeThread =
      function _summarizeThread_patched (aSelectedMessages, aListener) {
        if (!aSelectedMessages.length)
          return;

        let moveOn = htmlpane.contentDocument.location.href == "chrome://conversations/content/stub.html"
          ? function (f)
              f()
          : function (f) {
              htmlpane.addEventListener("load", function _g (event) {
                htmlpane.removeEventListener("load", _g, true);
                  f();
              }, true);
              htmlpane.contentDocument.location.href = "chrome://conversations/content/stub.html";
            }
          ;
        moveOn (function () {
          try {
            let conversation = new self._Conversation(window, aSelectedMessages);
            let messageList = htmlpane.contentDocument.getElementById("messageList");
            conversation.outputInto(messageList);
            // Make sure we have a global root --> conversation --> persistent
            // query chain to prevent the Conversation object (and its inner
            // query) to be collected. The Conversation keeps watching the Gloda
            // query for modified items (read/unread, starred, tags...).
            window.Conversations.currentConversation = conversation;
          } catch (e) {
            Log.error(e);
            dumpCallStack(e);
          }
        });
      };

    // Because we want to replace the standard message reader, we need to always
    // fire up the conversation view instead of deferring to the regular display
    // code. The trick is that re-using the original function's name allows us to
    // intercept the calls to the thread summary in regular situations (where a
    // normal thread summary would kick in) as a side-effect. That means we
    // don't need to hack into gMessageDisplay too much.
    window.gMessageDisplay.onSelectedMessagesChanged =
      function _onSelectedMessagesChanged_patched () {
        try {
          if (!this.active)
            return true;
          window.ClearPendingReadTimer();

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
            let wantedUrl = self._wantedUrl;
            self._wantedUrl = null;

            // We can't display NTTP messages and RSS messages properly yet, so
            // leave it up to the standard message reader. If the user explicitely
            // asked for the old message reader, we give up as well.
            if (msgHdrIsRss(msgHdr) || msgHdrIsNntp(msgHdr) ||
                wantedUrl == msgHdrToNeckoURL(msgHdr).spec) {
              // FIXME should use global prefs not to mark as read immediately
              Log.debug("Don't want to handle this message, deferring");
              msgHdrsMarkAsRead([msgHdr], true);
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
          Log.debug("Multiple selection, deferring to _showSummary()");
          return this._showSummary();
        } catch (e) {
          Log.error(e);
          dumpCallStack(e);
        }
      };

    Log.debug("Monkey patch successfully applied.");
  },

  expectUrl: function (aUrl) {
    Log.debug("Expecting "+aUrl+" to be loaded soon");
    this._wantedUrl = aUrl;
  },

}
