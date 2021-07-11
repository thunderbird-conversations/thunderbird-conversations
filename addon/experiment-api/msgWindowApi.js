/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Conversation: "chrome://conversations/content/modules/conversation.js",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  Services: "resource://gre/modules/Services.jsm",
  setupLogging: "chrome://conversations/content/modules/misc.js",
});

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.msgWindowApi");
});

const kMultiMessageUrl = "chrome://messenger/content/multimessageview.xhtml";

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

/**
 * Handles observing updates on windows.
 */
class WindowObserver {
  constructor(windowManager, callback) {
    this._windowManager = windowManager;
    this._callback = callback;
  }

  observe(subject, topic, data) {
    if (topic != "domwindowopened") {
      return;
    }
    let win;
    if (subject && "QueryInterface" in subject) {
      // Supports pre-TB 70.
      win = subject.QueryInterface(Ci.nsIDOMWindow).window;
    } else {
      win = subject;
    }
    waitForWindow(win).then(() => {
      if (
        win.document.location != "chrome://messenger/content/messenger.xul" &&
        win.document.location != "chrome://messenger/content/messenger.xhtml"
      ) {
        return;
      }
      this._callback(
        subject.window,
        this._windowManager.getWrapper(subject.window).id
      );
    });
  }
}

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { messageManager, tabManager, windowManager } = extension;
    return {
      convMsgWindow: {
        async getDisplayedMessages(tabId) {
          let tab = tabManager.get(tabId);
          let displayedMessages;

          if (tab.__proto__.constructor.name == "TabmailTab") {
            if (
              tab.active &&
              ["folder", "glodaList", "message"].includes(
                tab.nativeTab.mode.name
              )
            ) {
              displayedMessages = tab.nativeTab.folderDisplay.selectedMessages;
            }
          } else if (tab.nativeTab.gMessageDisplay) {
            displayedMessages = tab.nativeTab.folderDisplay.selectedMessages;
          }

          if (!displayedMessages) {
            return [];
          }

          let result = [];
          for (let msg of displayedMessages) {
            let hdr = messageManager.convert(msg);
            if (hdr) {
              result.push(hdr);
            }
          }
          return result;
        },
        async openNewWindow(url) {
          const win = getWindowFromId();
          // Counting some extra pixels for window decorations.
          let height = Math.min(win.screen.availHeight - 30, 1024);
          win.open(
            url,
            "_blank",
            "chrome,resizable,width=640,height=" + height
          );
        },
        onThreadPaneDoubleClick: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onThreadPaneDoubleClick",
          register(fire) {
            const patchDoubleClick = (win, id) => {
              win.oldThreadPaneDoubleClick = win.ThreadPaneDoubleClick;
              win.ThreadPaneDoubleClick = () => {
                // ThreadPaneDoubleClick calls OnMsgOpenSelectedMessages. We don't want to
                // replace the whole ThreadPaneDoubleClick function, just the line that
                // calls OnMsgOpenSelectedMessages in that function. So we do that weird
                // thing here.
                let oldMsgOpenSelectedMessages = win.MsgOpenSelectedMessages;
                let msgHdrs = win.gFolderDisplay.selectedMessages;
                msgHdrs = msgHdrs.map((hdr) => messageManager.convert(hdr));
                win.MsgOpenSelectedMessages = async () => {
                  let result = await fire
                    .async(id, msgHdrs)
                    .catch(console.error);
                  if (result?.cancel) {
                    return;
                  }
                  oldMsgOpenSelectedMessages();
                };
                win.oldThreadPaneDoubleClick();
                win.MsgOpenSelectedMessages = oldMsgOpenSelectedMessages;
              };
            };

            const windowObserver = new WindowObserver(
              windowManager,
              patchDoubleClick
            );
            monkeyPatchAllWindows(windowManager, patchDoubleClick);
            Services.ww.registerNotification(windowObserver);

            return function () {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                win.ThreadPaneDoubleClick = win.oldThreadPaneDoubleClick;
                delete win.oldThreadPaneDoubleClick;
              });
            };
          },
        }).api(),
        onThreadPaneMiddleClick: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onThreadPaneMiddleClick",
          register(fire) {
            const patchMiddleClick = (win, id) => {
              win.oldTreeOnMouseDown = win.TreeOnMouseDown;
              win.TreeOnMouseDown = async (event) => {
                if (
                  event.target.parentNode.id !== "threadTree" ||
                  event.button != 1
                ) {
                  win.oldTreeOnMouseDown(event);
                  return;
                }

                // Middle-click
                win.ChangeSelectionWithoutContentLoad(
                  event,
                  event.target.parentNode,
                  false
                );

                let msgHdrs = win.gFolderDisplay.selectedMessages;
                msgHdrs = msgHdrs.map((hdr) => messageManager.convert(hdr));
                let result = await fire.async(id, msgHdrs).catch(console.error);
                if (result?.cancel) {
                  return;
                }
                win.oldTreeOnMouseDown();
              };
            };

            const windowObserver = new WindowObserver(
              windowManager,
              patchMiddleClick
            );
            monkeyPatchAllWindows(windowManager, patchMiddleClick);
            Services.ww.registerNotification(windowObserver);

            return function () {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                // Try and ensure that whatever happens, we've cleaned up the
                // old listener.
                let folderTree = win.document.getElementById("folderTree");
                folderTree.removeEventListener(
                  "mousedown",
                  win.TreeOnMouseDown,
                  true
                );
                folderTree.removeEventListener(
                  "mousedown",
                  win.oldTreeOnMouseDown,
                  true
                );
                win.TreeOnMouseDown = win.oldTreeOnMouseDown;
                delete win.oldTreeOnMouseDown;
                folderTree.addEventListener(
                  "mousedown",
                  win.TreeOnMouseDown,
                  true
                );
              });
            };
          },
        }).api(),
        onMonkeyPatch: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onMonkeyPatch",
          register(fire) {
            const windowObserver = new WindowObserver(
              windowManager,
              specialPatches
            );
            monkeyPatchAllWindows(windowManager, specialPatches);
            Services.ww.registerNotification(windowObserver);

            return function () {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                for (const undo of win.conversationUndoFuncs) {
                  undo();
                }
              });
            };
          },
        }).api(),
        onSummarizeThread: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onMonkeyPatch",
          register(fire) {
            const windowObserver = new WindowObserver(
              windowManager,
              summarizeThreadHandler
            );
            monkeyPatchAllWindows(windowManager, summarizeThreadHandler);
            Services.ww.registerNotification(windowObserver);

            return function () {
              monkeyPatchAllWindows(windowManager, (win, id) => {
                Services.ww.unregisterNotification(windowObserver);
                win.summarizeThread = win.oldSummarizeThread;
                delete win.oldSummarizeThread;
                win.MessageDisplayWidget.prototype.onSelectedMessagesChanged =
                  win.originalOnSelectedMessagesChanged;
                delete win.originalOnSelectedMessagesChanged;
              });
            };
          },
        }).api(),
      },
    };
  }
};

function getWindowFromId(windowManager, context, id) {
  return id !== null && id !== undefined
    ? windowManager.get(id, context).window
    : Services.wm.getMostRecentWindow("mail:3pane");
}

function waitForWindow(win) {
  return new Promise((resolve) => {
    if (win.document.readyState == "complete") {
      resolve();
    } else {
      win.addEventListener(
        "load",
        () => {
          resolve();
        },
        { once: true }
      );
    }
  });
}

function monkeyPatchAllWindows(windowManager, callback) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    waitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id);
    });
  }
}

const specialPatches = (win) => {
  win.conversationUndoFuncs = [];
  const htmlpane = win.document.getElementById("multimessage");
  const messagepane = win.document.getElementById("messagepane");

  win.document
    .getElementById("multimessage")
    .setAttribute("context", "mailContext");

  // Because we're not even fetching the conversation when the message pane is
  //  hidden, we need to trigger it manually when it's un-hidden.
  let unhideListener = function () {
    win.summarizeThread(win.gFolderDisplay.selectedMessages);
  };
  win.addEventListener("messagepane-unhide", unhideListener, true);
  win.conversationUndoFuncs.push(() =>
    win.removeEventListener("messagepane-unhide", unhideListener, true)
  );

  let oldSummarizeMultipleSelection = win.summarizeMultipleSelection;
  win.summarizeMultipleSelection = function _summarizeMultiple_patched(
    aSelectedMessages,
    aListener
  ) {
    win.gSummaryFrameManager.loadAndCallback(kMultiMessageUrl, function () {
      oldSummarizeMultipleSelection(aSelectedMessages, aListener);
    });
  };
  win.conversationUndoFuncs.push(
    () => (win.summarizeMultipleSelection = oldSummarizeMultipleSelection)
  );

  // Ok, this is slightly tricky. The C++ code notifies the global msgWindow
  //  when content has been blocked, and we can't really afford to just
  //  replace the code, because that would defeat the standard reader (e.g. in
  //  a new tab). So we must find the message in the conversation and notify
  //  it if needed.
  win.oldOnMsgHasRemoteContent = win.messageHeaderSink.onMsgHasRemoteContent;
  win.messageHeaderSink.onMsgHasRemoteContent = function (
    msgHdr,
    contentURI,
    canOverride
  ) {
    const msgListeners = win.Conversations.msgListeners;
    const messageId = msgHdr.messageId;
    if (msgListeners.has(messageId)) {
      const listeners = msgListeners.get(messageId);
      for (const listener of listeners) {
        const obj = listener.get();
        if (obj) {
          obj.onMsgHasRemoteContent();
        }
      }
      msgListeners.set(
        messageId,
        listeners.filter((x) => x.get() != null)
      );
    }
    // Wicked case: we have the conversation and another tab with a message
    //  from the conversation in that tab. So to be safe, forward the call.
    win.oldOnMsgHasRemoteContent(msgHdr, contentURI, canOverride);
  };
  win.conversationUndoFuncs.push(
    () =>
      (win.messageHeaderSink.onMsgHasRemoteContent =
        win.oldOnMsgHasRemoteContent)
  );

  function fightAboutBlank() {
    if (messagepane.contentWindow.location.href == "about:blank") {
      // Workaround the "feature" that disables the context menu when the
      // messagepane points to about:blank
      messagepane.contentWindow.location.href = "about:blank?";
    }
  }
  messagepane.addEventListener("load", fightAboutBlank, true);
  win.conversationUndoFuncs.push(() =>
    messagepane.removeEventListener("load", fightAboutBlank, true)
  );
  fightAboutBlank();

  // Never allow prefetch, as we don't want to leak for pages.
  htmlpane.docShell.allowDNSPrefetch = false;
};

function isSelectionExpanded(win) {
  const msgIndex = win.gFolderDisplay
    ? win.gFolderDisplay.selectedIndices[0]
    : -1;
  if (msgIndex >= 0) {
    try {
      let viewThread = win.gDBView.getThreadContainingIndex(msgIndex);
      let rootIndex = win.gDBView.findIndexOfMsgHdr(
        viewThread.getChildHdrAt(0),
        false
      );
      if (rootIndex >= 0) {
        return (
          win.gDBView.isContainer(rootIndex) &&
          !win.gFolderDisplay.view.isCollapsedThreadAtIndex(rootIndex)
        );
      }
    } catch (ex) {
      console.error("Error in the onLocationChange handler", ex);
    }
  }
  return false;
}

async function determineIfSelectionIsThreaded(win) {
  // If we're not showing threaded, then we only worry about how many
  // messages are selected.
  if (!win.gFolderDisplay.view.showThreaded) {
    return false;
  }

  return !isSelectionExpanded(win);
}

function summarizeThreadHandler(win, id) {
  let previouslySelectedUris = [];
  let previousIsSelectionThreaded = null;

  let htmlpane = win.document.getElementById("multimessage");
  win.oldSummarizeThread = win.summarizeThread;
  // This one completely nukes the original summarizeThread function, which is
  //  actually the entry point to the original ThreadSummary class.
  win.summarizeThread = function _summarizeThread_patched(
    aSelectedMessages,
    aListener
  ) {
    if (!aSelectedMessages.length) {
      return;
    }

    if (!win.gMessageDisplay.visible) {
      Log.debug("Message pane is hidden, not fetching...");
      return;
    }

    win.gMessageDisplay.singleMessageDisplay = false;

    win.gSummaryFrameManager.loadAndCallback(
      "chrome://conversations/content/stub.html",
      function (isRefresh) {
        // See issue #673
        if (htmlpane.contentDocument?.body) {
          htmlpane.contentDocument.body.hidden = false;
        }

        if (isRefresh) {
          // Invalidate the previous selection
          previouslySelectedUris = [];
          // Invalidate any remaining conversation
          if (win.Conversations.currentConversation) {
            win.Conversations.currentConversation.cleanup();
            win.Conversations.currentConversation = null;
          }
          // Make the stub aware of the Conversations object it's currently
          //  representing.
          htmlpane.contentWindow.Conversations = win.Conversations;
          // The DOM window is fresh, it needs an event listener to forward
          //  keyboard shorcuts to the main window when the conversation view
          //  has focus.
          // It's crucial we register a non-capturing event listener here,
          //  otherwise the individual message nodes get no opportunity to do
          //  their own processing.
          htmlpane.contentWindow.addEventListener("keypress", function (event) {
            try {
              win.dispatchEvent(event);
            } catch (e) {
              // Log.debug("We failed to dispatch the event, don't know why...", e);
            }
          });
        }

        (async () => {
          // Should cancel most intempestive view refreshes, but only after we
          //  made sure the multimessage pane is shown. The logic behind this
          //  is the conversation in the message pane is already alive, and
          //  the gloda query is updating messages just fine, so we should not
          //  worry about messages which are not in the view.
          let newlySelectedUris = aSelectedMessages.map((m) => msgHdrGetUri(m));
          let isSelectionThreaded = determineIfSelectionIsThreaded(win);

          function isSubSetOrEqual(a1, a2) {
            if (!a1.length || !a2.length || a1.length > a2.length) {
              return false;
            }

            return a1.every((v, i) => {
              return v == a2[i];
            });
          }
          // If the selection is still threaded (or still not threaded), then
          // avoid redisplaying if we're displaying the same set or super-set.
          //
          // We avoid redisplay for the same set, as sometimes Thunderbird will
          // call the selection update twice when it hasn't changed.
          //
          // We avoid redisplay for the case when the previous set is a subset
          // as this can occur when:
          // - we've received a new message(s), but Gloda hasn't told us about
          //   it yet, and we pick it up in a future onItemsAddedn notification.
          // - the user has expended the selection. We won't update the
          //   expanded state of messages in this case, but that's probably okay
          //   since the user is probably selecting them to move them or
          //   something, rather than getting them expanded in the conversation
          //   view.
          //
          // In both cases, we should be safe to avoid regenerating the
          // conversation. If we find issues, we might need to revisit this
          // assumption.
          if (
            isSubSetOrEqual(previouslySelectedUris, newlySelectedUris) &&
            previousIsSelectionThreaded == isSelectionThreaded
          ) {
            Log.debug(
              "Hey, know what? The selection hasn't changed, so we're good!"
            );
            return;
          }
          // Remember the previously selected URIs now, so that if we get
          // a duplicate conversation, we don't try to start rending the same
          // conversation again whilst the previous one is still in progress.
          previouslySelectedUris = newlySelectedUris;
          previousIsSelectionThreaded = isSelectionThreaded;

          let freshConversation = new Conversation(
            win,
            aSelectedMessages,
            ++win.Conversations.counter
          );
          Log.debug(
            "New conversation:",
            freshConversation.counter,
            "Old conversation:",
            win.Conversations.currentConversation &&
              win.Conversations.currentConversation.counter
          );
          if (win.Conversations.currentConversation) {
            win.Conversations.currentConversation.cleanup();
          }
          win.Conversations.currentConversation = freshConversation;
          freshConversation.outputInto(
            htmlpane.contentWindow,
            async function (aConversation) {
              if (!aConversation.messages.length) {
                Log.debug("0 messages in aConversation");
                return;
              }
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

              // Here, put the final touches to our new conversation object.
              // TODO: Maybe re-enable this.
              // htmlpane.contentWindow.newComposeSessionByDraftIf();
              aConversation.completed = true;
              // TODO: Re-enable this.
              // htmlpane.contentWindow.registerQuickReply();

              win.gMessageDisplay.onLoadCompleted();
            }
          );
        })().catch(console.error);
      }
    );
  };

  // Because we want to replace the standard message reader, we need to always
  //  fire up the conversation view instead of deferring to the regular
  //  display code. The trick is that re-using the original function's name
  //  allows us to intercept the calls to the thread summary in regular
  //  situations (where a normal thread summary would kick in) as a
  //  side-effect. That means we don't need to hack into gMessageDisplay too
  //  much.
  win.originalOnSelectedMessagesChanged =
    win.MessageDisplayWidget.prototype.onSelectedMessagesChanged;
  win.MessageDisplayWidget.prototype.onSelectedMessagesChanged =
    function _onSelectedMessagesChanged_patched() {
      try {
        if (!this.active) {
          return true;
        }
        win.ClearPendingReadTimer();

        let selectedCount = this.folderDisplay.selectedCount;
        Log.debug(
          "Intercepted message load,",
          selectedCount,
          "message(s) selected"
        );

        if (selectedCount == 0) {
          // So we're not copying the code here. This changes nothing, and the
          // execution stays the same. But if someone (say, the account
          // summary extension) decides to redirect the code to _showSummary
          // in the case of selectedCount == 0 by monkey-patching
          // onSelectedMessagesChanged, we give it a chance to run.
          return win.originalOnSelectedMessagesChanged.call(this);
        } else if (selectedCount == 1) {
          // Here starts the part where we modify the original code.
          let msgHdr = this.folderDisplay.selectedMessage;
          // We can't display NTTP messages and RSS messages properly yet, so
          // leave it up to the standard message reader. If the user explicitely
          // asked for the old message reader, we give up as well.
          if (msgHdrIsRss(msgHdr) || msgHdrIsNntp(msgHdr)) {
            this.singleMessageDisplay = true;
            return false;
          }
          // Otherwise, we create a thread summary.
          // We don't want to call this._showSummary because it has a built-in check
          // for this.folderDisplay.selectedCount and returns immediately if
          // selectedCount == 1
          this.singleMessageDisplay = false;
          this.onDisplayingMessage(this.folderDisplay.selectedMessages[0]);
          win.summarizeThread(this.folderDisplay.selectedMessages, this);
          return true;
        }

        // Else defer to showSummary to work it out based on thread selection.
        // (This might be a MultiMessageSummary after all!)
        return this._showSummary();
      } catch (ex) {
        console.error(ex);
      }
      return false;
    };
}

/**
 * Tell if a message is an RSS feed item.
 *
 * @param {nsIMsgDBHdr} msgHdr The message header
 * @returns {boolean}
 */
function msgHdrIsRss(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsIRssIncomingServer;
}

/**
 * Tell if a message is a NNTP message.
 *
 * @param {nsIMsgDBHdr} msgHdr The message header
 * @returns {boolean}
 */
function msgHdrIsNntp(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsINntpIncomingServer;
}
