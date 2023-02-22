/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, Services */

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

let msgsChangedListeners = new Map();

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { messageManager, windowManager } = extension;
    return {
      convMsgWindow: {
        async maybeReloadMultiMessage(tabId) {
          let tabObject = context.extension.tabManager.get(tabId);
          let contentWin = tabObject.nativeTab.chromeBrowser.contentWindow;
          contentWin.webBrowser?.reload();
        },
        async openNewWindow(url, params) {
          const win = getWindowFromId();
          const args = { params };
          let features = "chrome,resizable,titlebar,minimizable";
          win.openDialog(url, "_blank", features, args);
        },
        async fireLoadCompleted(winId) {
          // let win = getWindowFromId(winId);
          // win.gMessageDisplay.onLoadCompleted();
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
        onThreadPaneActivate: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onThreadPaneDoubleClick",
          register(fire, tabId) {
            let tabObject = context.extension.tabManager.get(tabId);
            let contentWin = tabObject.nativeTab.chromeBrowser.contentWindow;
            let threadPane;

            waitForWindow(tabObject.nativeTab.chromeBrowser.contentWindow).then(
              () => {
                threadPane = contentWin.threadPane;

                threadPane._convOldOnItemActivate = threadPane._onItemActivate;
                threadPane._onItemActivate = (event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  (async () => {
                    let msgHdrs = contentWin.gDBView.getSelectedMsgHdrs();
                    let msgs = msgHdrs.map((m) =>
                      context.extension.messageManager.convert(m)
                    );
                    let result = await fire.async(tabId, msgs);
                    if (result?.cancel) {
                      return;
                    }
                    contentWin.threadPane._convOldOnItemActivate(event);
                  })();
                };
              }
            );

            return function () {
              threadPane._onItemActivate = threadPane._convOldOnItemActivate;
              delete threadPane._convOldOnItemActivate;
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
          register(fire, tabId) {
            let tabObject = context.extension.tabManager.get(tabId);
            let contentWin = tabObject.nativeTab.chromeBrowser.contentWindow;

            // TODO: How to wait for tab loaded?
            // Probably need to wait for the nativeTab to finish loading?
            // Or maybe a browser underneath it?
            waitForWindow(tabObject.nativeTab.chromeBrowser.contentWindow).then(
              () => {
                summarizeThreadHandler(contentWin, tabId, context);
              }
            );
            return function () {
              let threadPane = contentWin.threadPane;
              threadPane._onSelect = threadPane._oldOnSelect;
              delete threadPane._oldOnSelect;
            };
          },
        }).api(),
        onMsgHasRemoteContent: new ExtensionCommon.EventManager({
          context,
          name: "convMsgWindow.onMsgHasRemoteContent",
          register(fire, tabId) {
            let tabObject = context.extension.tabManager.get(tabId);
            let contentWin = tabObject.nativeTab.chromeBrowser.contentWindow;

            function observer(subject, topic, data) {
              if (topic != "remote-content-blocked") {
                return;
              }
              console.log({ data });
              let listener = remoteContentListeners.get(data);
              listener?.async();
            }
            if (remoteContentListeners.size == 0) {
              Services.obs.addObserver(observer, "remote-content-blocked");
            }
            // TODO: Gonna need to get the streamed message browser here. Not
            // just the conversations browser.
            remoteContentListeners.set(
              contentWin.webBrowser.browsingContext.id,
              fire
            );
            return function () {
              remoteContentListeners.delete(
                contentWin.webBrowser.browsingContext.id
              );
              if (remoteContentListeners.size == 0) {
                Services.obs.removeObserver(observer, "remote-content-blocked");
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

let remoteContentListeners = new Map();
let remoteContentWindowListener = null;
let printListeners = new Set();
let printWindowListener = null;

function getWindowFromId(windowManager, context, id) {
  return id !== null && id !== undefined
    ? windowManager.get(id, context).window
    : Services.wm.getMostRecentWindow("mail:3pane");
}

// Only needed until https://bugzilla.mozilla.org/show_bug.cgi?id=1817872 is
// resolved.
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

// TODO: FIX THIS
// xref https://searchfox.org/comm-central/rev/e14086adbf23a7cc1a4c7e128b5729ce112b9ff9/mail/base/content/msgHdrView.js#497-506
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

function summarizeThreadHandler(contentWin, tabId, context) {
  const STUB_URI = "chrome://conversations/content/stub.html";

  let threadPane = contentWin.threadPane;

  // Replace Thunderbird's onSelect with our own, so that we can display
  // our Conversations reader when we need to.
  threadPane._oldOnSelect = threadPane._onSelect;
  threadPane._onSelect = async (event) => {
    if (
      contentWin.paneLayout.messagePaneSplitter.isCollapsed ||
      !contentWin.gDBView
    ) {
      return;
    }

    // TODO: RSS?
    // TODO: Check if messages span multiple threads & if so, defer to
    // _oldOnSelect
    if (contentWin.gDBView.numSelected == 0) {
      threadPane._oldOnSelect(event);
      return;
    }
    if (contentWin.webBrowser?.documentURI?.spec != STUB_URI) {
      contentWin.displayWebPage("chrome://conversations/content/stub.html");
    }

    let msgs = [];
    let msgHdrs = contentWin.gDBView.getSelectedMsgHdrs();

    for (let msg of msgHdrs) {
      if (msgHdrIsRss(msg) || msgHdrIsNntp(msg)) {
        // If we have any RSS or News messages, defer to Thunderbird's view.
        threadPane._oldOnSelect(event);
        return;
      }
      msgs.push(await context.extension.messageManager.convert(msg));
    }

    // TODO : Get this working for mail selection.
    // WORK out the messages to pass to .async.
    msgsChangedListeners.get(tabId)?.async(msgs);
  };

  //  tabObject.nativeTab.chromeBrowser.ownerGlobal.summarizeThread();
  // let previouslySelectedUris = [];
  // let previousIsSelectionThreaded = null;

  // let htmlpane = contentWin.document.getElementById("multiMessageBrowser");
  // chromeBrowser.ownerGlobal.oldSummarizeThread =
  //   chromeBrowser.ownerGlobal.summarizeThread;
  // // This one completely nukes the original summarizeThread function, which is
  // //  actually the entry point to the original ThreadSummary class.
  // chromeBrowser.ownerGlobal.summarizeThread = function _summarizeThread_patched(
  //   aSelectedMessages,
  //   messageDisplay
  // ) {
  //   if (!aSelectedMessages.length) {
  //     return;
  //   }

  //   if (!tabObject.nativeTab.messagePaneVisible) {
  //     // Log.debug("Message pane is hidden, not fetching...");
  //     return;
  //   }

  //   let folderDisplay = messageDisplay.folderDisplay;
  //   let selectedIndices = folderDisplay.selectedIndices;
  //   if (selectedIndices.length == 1) {
  //     let dbView = folderDisplay.view.dbView;
  //     if (dbView.getRowProperties(selectedIndices[0]) == "dummy") {
  //       // Abort Abort! This is really a multi-message view. Call Thunderbird's
  //       // viewer instead.
  //       chromeBrowser.ownerGlobal.summarizeMultipleSelection(
  //         aSelectedMessages,
  //         messageDisplay
  //       );
  //       return;
  //     }
  //   }

  //   chromeBrowser.ownerGlobal.gMessageDisplay.singleMessageDisplay = false;

  //   // Save the newly selected messages as early as possible, so that we
  //   // definitely have them as soon as stub.html loads.
  //   let selectedMessages = [...aSelectedMessages];

  //   win.gSummaryFrameManager.loadAndCallback(
  //     "chrome://conversations/content/stub.html",
  //     async function (isRefresh) {
  //       // See issue #673
  //       if (htmlpane.contentDocument?.body) {
  //         htmlpane.contentDocument.body.hidden = false;
  //       }

  //       if (isRefresh) {
  //         // Invalidate the previous selection
  //         previouslySelectedUris = [];
  //         // The DOM window is fresh, it needs an event listener to forward
  //         //  keyboard shorcuts to the main window when the conversation view
  //         //  has focus.
  //         // It's crucial we register a non-capturing event listener here,
  //         //  otherwise the individual message nodes get no opportunity to do
  //         //  their own processing.
  //         htmlpane.contentWindow.addEventListener("keypress", function (event) {
  //           try {
  //             win.dispatchEvent(event);
  //           } catch (e) {
  //             // Log.debug("We failed to dispatch the event, don't know why...", e);
  //           }
  //         });
  //       }

  //       // Should cancel most intempestive view refreshes, but only after we
  //       //  made sure the multimessage pane is shown. The logic behind this
  //       //  is the conversation in the message pane is already alive, and
  //       //  the gloda query is updating messages just fine, so we should not
  //       //  worry about messages which are not in the view.
  //       let newlySelectedUris = aSelectedMessages.map((m) =>
  //         m.folder.getUriForMsg(m)
  //       );
  //       let isSelectionThreaded = determineIfSelectionIsThreaded(win);

  //       function isSubSetOrEqual(a1, a2) {
  //         if (!a1.length || !a2.length || a1.length > a2.length) {
  //           return false;
  //         }

  //         return a1.every((v, i) => {
  //           return v == a2[i];
  //         });
  //       }
  //       // If the selection is still threaded (or still not threaded), then
  //       // avoid redisplaying if we're displaying the same set or super-set.
  //       //
  //       // We avoid redisplay for the same set, as sometimes Thunderbird will
  //       // call the selection update twice when it hasn't changed.
  //       //
  //       // We avoid redisplay for the case when the previous set is a subset
  //       // as this can occur when:
  //       // - we've received a new message(s), but Gloda hasn't told us about
  //       //   it yet, and we pick it up in a future onItemsAddedn notification.
  //       // - the user has expended the selection. We won't update the
  //       //   expanded state of messages in this case, but that's probably okay
  //       //   since the user is probably selecting them to move them or
  //       //   something, rather than getting them expanded in the conversation
  //       //   view.
  //       //
  //       // In both cases, we should be safe to avoid regenerating the
  //       // conversation. If we find issues, we might need to revisit this
  //       // assumption.
  //       if (
  //         isSubSetOrEqual(previouslySelectedUris, newlySelectedUris) &&
  //         previousIsSelectionThreaded == isSelectionThreaded
  //       ) {
  //         // Log.debug(
  //         //   "Hey, know what? The selection hasn't changed, so we're good!"
  //         // );
  //         return;
  //       }
  //       // Remember the previously selected URIs now, so that if we get
  //       // a duplicate conversation, we don't try to start rending the same
  //       // conversation again whilst the previous one is still in progress.
  //       previouslySelectedUris = newlySelectedUris;
  //       previousIsSelectionThreaded = isSelectionThreaded;

  //       let tabmail = win.document.getElementById("tabmail");
  //       let tabId = context.extension.tabManager.convert(
  //         tabmail.selectedTab
  //       ).id;
  //       let msgs = [];
  //       for (let m of selectedMessages) {
  //         msgs.push(await context.extension.messageManager.convert(m));
  //       }
  //       msgsChangedListeners.get(tabId)?.async(msgs);
  //     }
  //   );
  // };
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
