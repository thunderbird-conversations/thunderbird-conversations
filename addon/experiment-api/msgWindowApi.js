var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

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
  for (let w of Services.wm.getEnumerator("mail:3pane")) {
    waitForWindow(w).then(() => callback(w, windowManager.getWrapper(w).id));
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

            // This obserer is notified when a new window is created and injects our code
            let windowObserver = {
              observe(aSubject, aTopic, aData) {
                if (aTopic == "domwindowopened") {
                  if (aSubject && "QueryInterface" in aSubject) {
                    aSubject.QueryInterface(Ci.nsIDOMWindow);
                    waitForWindow(aSubject.window).then(() =>
                      patchDoubleClick(
                        aSubject.window,
                        windowManager.getWrapper(aSubject.window).id
                      )
                    );
                  }
                }
              },
            };

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
      },
    };
  }
};
