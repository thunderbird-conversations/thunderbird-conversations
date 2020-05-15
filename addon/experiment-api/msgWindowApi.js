var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const kMultiMessageUrl = "chrome://messenger/content/multimessageview.xhtml";

class WindowObserver {
  constructor(windowManager, callback) {
    this._windowManager = windowManager;
    this._callback = callback;
  }

  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      if (aSubject && "QueryInterface" in aSubject) {
        const win = aSubject.QueryInterface(Ci.nsIDOMWindow).window;
        waitForWindow(win).then(() => {
          if (
            win.document.location !=
              "chrome://messenger/content/messenger.xul" &&
            win.document.location !=
              "chrome://messenger/content/messenger.xhtml"
          ) {
            return;
          }
          this._callback(
            aSubject.window,
            this._windowManager.getWrapper(aSubject.window).id
          );
        });
      }
    }
  }
}

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { messageManager, windowManager } = extension;
    return {
      convMsgWindow: {
        async isSelectionExpanded(windowId) {
          const win = getWindowFromId(windowManager, context, windowId);
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
        },
        async isSelectionThreaded(windowId) {
          const win = getWindowFromId(windowManager, context, windowId);
          // If we're not showing threaded, then we only worry about how many
          // messages are selected.
          if (!win.gFolderDisplay.view.showThreaded) {
            return false;
          }

          return !(await this.isSelectionExpanded(windowId));
        },
        async selectedMessages(windowId) {
          const win = getWindowFromId(windowManager, context, windowId);

          return win.gFolderDisplay.selectedMessages.map(hdr =>
            messageManager.convert(hdr)
          );
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
                msgHdrs = msgHdrs.map(hdr => messageManager.convert(hdr));
                win.MsgOpenSelectedMessages = async () => {
                  let result = await fire
                    .async(id, msgHdrs)
                    .catch(console.error);
                  if (result && result.cancel) {
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

            return function() {
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
            // Same thing for middle-click
            const patchMiddleClick = (win, id) => {
              win.oldTreeOnMouseDown = win.TreeOnMouseDown;
              win.TreeOnMouseDown = async event => {
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
                msgHdrs = msgHdrs.map(hdr => messageManager.convert(hdr));
                let result = await fire.async(id, msgHdrs).catch(console.error);
                if (result && result.cancel) {
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

            return function() {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                win.TreeOnMouseDown = win.oldTreeOnMouseDown;
                delete win.oldTreeOnMouseDown;
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

            return function() {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                for (const undo of win.conversationUndoFuncs) {
                  undo();
                }
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
  return new Promise(resolve => {
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

const specialPatches = (win, id) => {
  win.conversationWindowId = id;
  win.conversationUndoFuncs = [];
  const htmlpane = win.document.getElementById("multimessage");
  const messagepane = win.document.getElementById("messagepane");

  // Because we're not even fetching the conversation when the message pane is
  //  hidden, we need to trigger it manually when it's un-hidden.
  let unhideListener = function() {
    win.summarizeThread(window.gFolderDisplay.selectedMessages);
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
    win.gSummaryFrameManager.loadAndCallback(kMultiMessageUrl, function() {
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
  win.messageHeaderSink.onMsgHasRemoteContent = function(
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
        listeners.filter(x => x.get() != null)
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
