var EXPORTED_SYMBOLS = ['MonkeyPatch']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("chrome://conversations/modules/MsgHdrUtils.js");
Cu.import("chrome://conversations/modules/prefs.js");
Cu.import("chrome://conversations/modules/log.js");

const Log = setupLogging();

function MonkeyPatch(aWindow, aConversation) {
  this._Conversation = aConversation;
  this._wantedUrl = "";
  this._window = aWindow;
}

MonkeyPatch.prototype = {

  apply: function () {
    let mmPane = this._window.document.getElementById("multimessage");

    // This one completely nukes the original summarizeThread function, which is
    // actually the entry point to the original ThreadSummary class.
    aWindow.summarizeThread =
      function _summarizeThread_patched (aSelectedMessages, aListener) {
        if (!aSelectedMessages.length)
          return;

        let moveOn = mmPane.document.location.href == "chrome://conversations/content/stub.html"
          ? function (f)
              f()
          : function (f) {
              mmPane.addEventListener("load", function _g (event) {
                mmPane.removeEventListener("load", _g, true);
                  f();
              }, true);
            }
          ;
        moveOn (function () {
          let conversation = new this._Conversation(aSelectedMessages);
          let messagesList = mmPane.contentDocument.getElementById("messagesList");
          conversation.outputInto(messagesList);
          // So that we have a global root --> conversation --> persistent query
          // chain to prevent the Conversation object (and its inner query) to
          // be collected. The Conversation keeps watching the Gloda query for
          // modified items (read/unread, starred, tags...).
          this._window.GCV.currentConversation = conversation;
        });
      };

    // Because we want to replace the standard message reader, we need to always
    // fire up the conversation view instead of deferring to the regular display
    // code. The trick is that re-using the original function's name allows us to
    // intercept the calls to the thread summary in regular situations (where a
    // normal thread summary would kick in) as a side-effect. That means we
    // don't need to hack into gMessageDisplay too much.
    aWindow.gMessageDisplay.onSelectedMessagesChanged =
      function _onSelectedMessagesChanged_patched () {
        try {
          if (!this.active)
            return true;
          this._window.ClearPendingReadTimer();

          let selectedCount = this.folderDisplay.selectedCount;
          Log.debug("Intercepted message load, ", selectedCount, " message(s) selected\n");

          if (selectedCount == 0) {
            this.clearDisplay();
            // Once in our lifetime is plenty.
            if (!this._haveDisplayedStartPage) {
              this._window.loadStartPage(false);
              this._haveDisplayedStartPage = true;
            }
            this.singleMessageDisplay = true;
            return true;

          } else if (selectedCount == 1) {
            // Here starts the part where we modify the original code.
            let msgHdr = this.folderDisplay.selectedMessage;
            let wantedUrl = this._wantedUrl;
            this._wantedUrl = null;

            // We can't display NTTP messages and RSS messages properly yet, so
            // leave it up to the standard message reader. If the user explicitely
            // asked for the old message reader, we give up as well.
            if (msgHdrIsRss(msgHdr) || msgHdrIsNntp(msgHdr) ||
                wantedUrl == msgHdrToNeckoURL(msgHdr, aWindow.gMessenger).spec) {
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
              aWindow.summarizeThread(this.folderDisplay.selectedMessages, this);
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
