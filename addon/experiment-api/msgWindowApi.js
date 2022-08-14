/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon */

ChromeUtils.defineModuleGetter(
  this,
  "Services",
  "resource://gre/modules/Services.jsm"
);

const kMultiMessageUrl = "chrome://messenger/content/multimessageview.xhtml";

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

/**
 * Handles observing updates on windows.
 */
class WindowObserver {
  constructor(windowManager, callback, context) {
    this._windowManager = windowManager;
    this._callback = callback;
    this._context = context;
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
        this._windowManager.getWrapper(subject.window).id,
        this._context
      );
    });
  }
}

let selectedMessages = [];
let msgsChangedListeners = new Map();

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { messageManager, windowManager } = extension;
    return {
      convMsgWindow: {
        async maybeReloadMultiMessage() {
          monkeyPatchAllWindows(windowManager, (win) => {
            // Pretend the selection has changed, to update any message pane
            // browsers as necessary.
            win.document.getElementById("threadTree").view.selectionChanged();
            let multimessage = win.document.getElementById("multimessage");
            if (
              multimessage?.documentURI.spec ==
              "chrome://conversations/content/stub.html"
            ) {
              multimessage.reload();
            }
          });
        },
        async openNewWindow(url, params) {
          const win = getWindowFromId();
          const args = { params };
          let features = "chrome,resizable,titlebar,minimizable";
          win.openDialog(url, "_blank", features, args);
        },
        async fireLoadCompleted(winId) {
          let win = getWindowFromId(winId);
          win.gMessageDisplay.onLoadCompleted();
        },
        async print(winId, iframeId) {
          let win = getWindowFromId(winId);
          let multimessage = win.document.getElementById("multimessage");
          let messageIframe =
            multimessage.contentDocument.getElementsByClassName(iframeId)[0];
          win.PrintUtils.startPrintWindow(messageIframe.browsingContext, {
            printFrameOnly: true,
          });
        },
        onSelectedMessagesChanged: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onSelectedMessagesChanged",
          register(fire, tabId) {
            msgsChangedListeners.set(tabId, fire);
            return function () {
              msgsChangedListeners.delete(tabId);
            };
          },
        }).api(),
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
            const threadWindowObserver = new WindowObserver(
              windowManager,
              summarizeThreadHandler,
              context
            );
            monkeyPatchAllWindows(
              windowManager,
              summarizeThreadHandler,
              context
            );
            Services.ww.registerNotification(threadWindowObserver);

            return function () {
              Services.ww.unregisterNotification(windowObserver);
              Services.ww.unregisterNotification(threadWindowObserver);
              monkeyPatchAllWindows(windowManager, (win, id) => {
                for (const undo of win.conversationUndoFuncs) {
                  undo();
                }

                win.summarizeThread = win.oldSummarizeThread;
                delete win.oldSummarizeThread;
                win.MessageDisplayWidget.prototype.onSelectedMessagesChanged =
                  win.originalOnSelectedMessagesChanged;
                delete win.originalOnSelectedMessagesChanged;

                // Fake updating the selection to get the message panes in the
                // correct states for Conversations having been removed.
                win.document
                  .getElementById("threadTree")
                  .view.selectionChanged();
              });
            };
          },
        }).api(),
        onLayoutChange: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onLayoutChange",
          register(fire) {
            let listener = () => fire.async();
            Services.prefs.addObserver("mail.pane_config.dynamic", listener);

            return () => {
              Services.prefs.removeObserver(
                "mail.pane_config.dynamic",
                listener
              );
            };
          },
        }).api(),
        onMsgHasRemoteContent: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onMsgHasRemoteContent",
          register(fire) {
            if (remoteContentListeners.size == 0) {
              remoteContentWindowListener = new WindowObserver(
                windowManager,
                remoteContentPatch,
                context
              );
              monkeyPatchAllWindows(windowManager, remoteContentPatch, context);
              Services.ww.registerNotification(remoteContentWindowListener);
            }
            remoteContentListeners.add(fire);

            return function () {
              remoteContentListeners.delete(fire);
              if (remoteContentListeners.size == 0) {
                Services.ww.unregisterNotification(remoteContentWindowListener);
                monkeyPatchAllWindows(windowManager, (win, id) => {
                  win.messageHeaderSink.onMsgHasRemoteContent =
                    win.oldOnMsgHasRemoteContent;
                });
              }
            };
          },
        }).api(),
        onPrint: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onPrint",
          register(fire) {
            if (printListeners.size == 0) {
              printWindowListener = new WindowObserver(
                windowManager,
                printPatch,
                context
              );
              monkeyPatchAllWindows(windowManager, printPatch, context);
              Services.ww.registerNotification(printWindowListener);
            }
            printListeners.add(fire);

            return function () {
              printListeners.delete(fire);
              if (printListeners.size == 0) {
                Services.ww.unregisterNotification(printWindowListener);
                monkeyPatchAllWindows(windowManager, (win) => {
                  win.controllers.removeController(
                    win.conversationsPrintController
                  );
                  delete win.conversationsPrintController;
                });
              }
            };
          },
        }).api(),
      },
    };
  }
};

let remoteContentListeners = new Set();
let remoteContentWindowListener = null;
let printListeners = new Set();
let printWindowListener = null;

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

function monkeyPatchAllWindows(windowManager, callback, context) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    waitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id, context);
    });
  }
}

const remoteContentPatch = (win, id, context) => {
  // Ok, this is slightly tricky. The C++ code notifies the global msgWindow
  //  when content has been blocked, and we can't really afford to just
  //  replace the code, because that would defeat the standard reader (e.g. in
  //  a new tab). So we must find the message in the conversation and notify
  //  it if needed.
  win.oldOnMsgHasRemoteContent = win.messageHeaderSink.onMsgHasRemoteContent;
  win.messageHeaderSink.onMsgHasRemoteContent = async function (
    msgHdr,
    contentURI,
    canOverride
  ) {
    let id = (await context.extension.messageManager.convert(msgHdr)).id;
    for (let listener of remoteContentListeners) {
      listener.async(id);
    }
    // Wicked case: we have the conversation and another tab with a message
    //  from the conversation in that tab. So to be safe, forward the call.
    win.oldOnMsgHasRemoteContent(msgHdr, contentURI, canOverride);
  };
};

const printPatch = (win, winId, context) => {
  let tabmail = win.document.getElementById("tabmail");
  var PrintController = {
    supportsCommand(command) {
      switch (command) {
        case "button_print":
        case "cmd_print":
          return (
            (tabmail.selectedTab.mode?.type == "folder" &&
              tabmail.selectedTab.messageDisplay.visible) ||
            (tabmail.selectedTab.mode?.type == "contentTab" &&
              tabmail.selectedBrowser?.browsingContext.currentURI.spec.startsWith(
                "chrome://conversations/content/stub.html"
              ))
          );
        default:
          return false;
      }
    },
    isCommandEnabled(command) {
      switch (command) {
        case "button_print":
        case "cmd_print":
          if (tabmail.selectedTab.mode?.type == "folder") {
            let numSelected = win.gFolderDisplay.selectedCount;
            // TODO: Allow printing multiple selected messages if TB allows it.
            if (numSelected != 1) {
              return false;
            }
            if (
              !win.gFolderDisplay.getCommandStatus(
                Ci.nsMsgViewCommandType.cmdRequiringMsgBody
              )
            ) {
              return false;
            }

            // Check if we have a collapsed thread selected and are summarizing it.
            // If so, selectedIndices.length won't match numSelected. Also check
            // that we're not displaying a message, which handles the case
            // where we failed to summarize the selection and fell back to
            // displaying a message.
            if (
              win.gFolderDisplay.selectedIndices.length != numSelected &&
              command != "cmd_applyFiltersToSelection" &&
              win.gDBView &&
              win.gDBView.currentlyDisplayedMessage == win.nsMsgViewIndex_None
            ) {
              return false;
            }
            return true;
          }
          // else, must be a content tab, so return false for now.
          return false;
        default:
          return false;
      }
    },
    async doCommand(command) {
      switch (command) {
        case "button_print":
        case "cmd_print":
          let id = (
            await context.extension.messageManager.convert(
              win.gFolderDisplay.selectedMessage
            )
          ).id;
          for (let listener of printListeners) {
            listener.async(winId, id);
          }
          break;
      }
    },
    QueryInterface: ChromeUtils.generateQI(["nsIController"]),
  };

  let toolbox = win.document.getElementById("mail-toolbox");
  // Use this as a proxy for if mail-startup-done has been called.
  if (toolbox.customizeDone) {
    win.controllers.insertControllerAt(0, PrintController);
  } else {
    // The main window is loaded when the monkey-patch is applied
    let observer = {
      observe(msgWin, aTopic, aData) {
        if (msgWin == win) {
          Services.obs.removeObserver(observer, "mail-startup-done");
          win.controllers.insertControllerAt(0, PrintController);
        }
      },
    };
    Services.obs.addObserver(observer, "mail-startup-done");
  }
  win.conversationsPrintController = PrintController;
};

const specialPatches = (win) => {
  win.conversationUndoFuncs = [];
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

  function fightAboutBlank() {
    if (messagepane.contentWindow?.location.href == "about:blank") {
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

function determineIfSelectionIsThreaded(win) {
  // If we're not showing threaded, then we only worry about how many
  // messages are selected.
  if (!win.gFolderDisplay.view.showThreaded) {
    return false;
  }

  return !isSelectionExpanded(win);
}

function summarizeThreadHandler(win, id, context) {
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
      // Log.debug("Message pane is hidden, not fetching...");
      return;
    }

    win.gMessageDisplay.singleMessageDisplay = false;

    // Save the newly selected messages as early as possible, so that we
    // definitely have them as soon as stub.html loads.
    selectedMessages = [...aSelectedMessages];

    win.gSummaryFrameManager.loadAndCallback(
      "chrome://conversations/content/stub.html",
      async function (isRefresh) {
        // See issue #673
        if (htmlpane.contentDocument?.body) {
          htmlpane.contentDocument.body.hidden = false;
        }

        if (isRefresh) {
          // Invalidate the previous selection
          previouslySelectedUris = [];
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

        // Should cancel most intempestive view refreshes, but only after we
        //  made sure the multimessage pane is shown. The logic behind this
        //  is the conversation in the message pane is already alive, and
        //  the gloda query is updating messages just fine, so we should not
        //  worry about messages which are not in the view.
        let newlySelectedUris = aSelectedMessages.map((m) =>
          m.folder.getUriForMsg(m)
        );
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
          // Log.debug(
          //   "Hey, know what? The selection hasn't changed, so we're good!"
          // );
          return;
        }
        // Remember the previously selected URIs now, so that if we get
        // a duplicate conversation, we don't try to start rending the same
        // conversation again whilst the previous one is still in progress.
        previouslySelectedUris = newlySelectedUris;
        previousIsSelectionThreaded = isSelectionThreaded;

        let tabmail = win.document.getElementById("tabmail");
        let tabId = context.extension.tabManager.convert(
          tabmail.selectedTab
        ).id;
        let msgs = [];
        for (let m of selectedMessages) {
          msgs.push(await context.extension.messageManager.convert(m));
        }
        msgsChangedListeners.get(tabId)?.async(msgs);
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
        // Log.debug(
        //   "Intercepted message load,",
        //   selectedCount,
        //   "message(s) selected"
        // );

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
