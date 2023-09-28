/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, Services */

ChromeUtils.defineModuleGetter(
  this,
  "MailE10SUtils",
  "resource:///modules/MailE10SUtils.jsm"
);

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */

function msgWinApigetWinBrowserFromIds(context, winId, tabId) {
  if (!tabId) {
    // windowManager only recognises Thunderbird windows, so we can't
    // use getWindowFromId.
    let win = Services.wm.getOuterWindowWithId(winId);

    return {
      // windowManager only recognises Thunderbird windows, so we can't
      // use getWindowFromId.
      win,
      msgBrowser: win.document.getElementById("multimessage"),
    };
  }

  let tabObject = context.extension.tabManager.get(tabId);
  if (!tabObject.nativeTab) {
    throw new Error("Failed to find tab");
  }
  let win = Cu.getGlobalForObject(tabObject.nativeTab);
  if (!win) {
    throw new Error("Failed to extract window from tab");
  }
  if (tabObject.nativeTab.mode.type == "contentTab") {
    return { win, msgBrowser: tabObject.browser };
  }
  return {
    win,
    msgBrowser:
      tabObject.nativeTab.chromeBrowser.contentWindow.multiMessageBrowser,
  };
}

let msgsChangedListeners = new Map();
let remoteContentListeners = new Map();

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    function observer(subject, topic, data) {
      if (topic != "remote-content-blocked") {
        return;
      }
      for (let [iframeName, listenerData] of remoteContentListeners.entries()) {
        let { msgBrowser } = msgWinApigetWinBrowserFromIds(
          context,
          listenerData.winId,
          listenerData.tabId
        );
        let contentDoc = msgBrowser.contentDocument;
        let elements = contentDoc.getElementsByClassName(iframeName);
        if (elements.length && elements[0]?.browsingContext.id == data) {
          listenerData.fire.async();
        }
      }
    }

    return {
      convMsgWindow: {
        async maybeReloadMultiMessage(tabId) {
          let tabObject = context.extension.tabManager.get(tabId);
          let contentWin = tabObject.nativeTab.chromeBrowser.contentWindow;
          contentWin.multiMessageBrowser?.reload();
        },
        async openNewWindow(url, params) {
          const win = getWindowFromId();
          const args = { params };
          let features = "chrome,resizable,titlebar,minimizable";
          win.openDialog(url, "_blank", features, args);
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
          register(fire, tabId, winId, iframeName) {
            if (remoteContentListeners.size == 0) {
              Services.obs.addObserver(observer, "remote-content-blocked");
            }
            remoteContentListeners.set(iframeName, { winId, tabId, fire });
            return function () {
              remoteContentListeners.delete(iframeName);
              if (remoteContentListeners.size == 0) {
                Services.obs.removeObserver(observer, "remote-content-blocked");
              }
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

function isSelectionExpanded(contentWin) {
  const msgIndex = contentWin.threadTree.selectedIndices.length
    ? contentWin.threadTree.selectedIndices[0]
    : -1;
  if (msgIndex >= 0) {
    try {
      let viewThread = contentWin.gDBView.getThreadContainingIndex(msgIndex);
      let rootIndex = contentWin.gDBView.findIndexOfMsgHdr(
        viewThread.getChildHdrAt(0),
        false
      );
      if (rootIndex >= 0) {
        return (
          contentWin.gDBView.isContainer(rootIndex) &&
          !contentWin.gViewWrapper.isCollapsedThreadAtIndex(rootIndex)
        );
      }
    } catch (ex) {
      console.error("Error in the onLocationChange handler", ex);
    }
  }
  return false;
}

function determineIfSelectionIsThreaded(contentWin) {
  // If we're not showing threaded, then we only worry about how many
  // messages are selected.
  if (!contentWin.gViewWrapper.showThreaded) {
    return false;
  }

  return !isSelectionExpanded(contentWin);
}

function summarizeThreadHandler(contentWin, tabId, context) {
  const STUB_URI = "chrome://conversations/content/stub.html";

  let threadPane = contentWin.threadPane;
  let previouslySelectedUris = [];
  let previousIsSelectionThreaded = null;

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

    async function maybeLoadMultiMessagePage() {
      const multiMessageURI =
        "chrome://messenger/content/multimessageview.xhtml";
      if (
        contentWin.multiMessageBrowser?.documentURI?.spec != multiMessageURI
      ) {
        await new Promise((resolve) => {
          contentWin.multiMessageBrowser.addEventListener("load", resolve, {
            once: true,
            capture: true,
          });
          MailE10SUtils.loadURI(
            contentWin.multiMessageBrowser,
            multiMessageURI
          );
        });
      }
    }

    let numSelected = contentWin.gDBView.numSelected;
    if (numSelected == 0) {
      threadPane._oldOnSelect(event);
      return;
    } else if (
      // Defer to the Thunderbird method if there's a dummy row selected,
      // e.g. a grouped by sort header.
      contentWin.threadTree.selectedIndices.length == 1 &&
      contentWin.gDBView.getRowProperties(
        contentWin.threadTree.selectedIndices[0]
      ) == "dummy"
    ) {
      maybeLoadMultiMessagePage().then(() => threadPane._oldOnSelect(event));
      return;
    }

    let msgs = [];
    let msgHdrs = contentWin.gDBView.getSelectedMsgHdrs();

    if (msgHdrs.length == 1 && msgHdrIsRssOrNews(msgHdrs[0])) {
      // If we have any RSS or News messages, defer to Thunderbird's view.
      maybeLoadMultiMessagePage().then(() => threadPane._oldOnSelect(event));
      return;
    }

    let getThreadId = function (msgHdr) {
      return contentWin.gDBView
        .getThreadContainingMsgHdr(msgHdr)
        .getChildHdrAt(0).messageKey;
    };

    let firstThreadId = getThreadId(msgHdrs[0]);
    for (let i = 1; i < msgHdrs.length; i++) {
      // If this is multi-thread selection, defer to Thunderbird's views.
      //
      // We intentionally do not skip RSS/news messages here as some people
      // have managed to get Thunderbird set up to have them threaded (#2016).
      // Though this is supported on a totally un-supported basis.
      if (getThreadId(msgHdrs[i]) != firstThreadId) {
        maybeLoadMultiMessagePage().then(() => threadPane._oldOnSelect(event));
        return;
      }
    }

    contentWin.messagePane._keepStartPageOpen = false;
    contentWin.messagePane.clearWebPage();
    contentWin.messagePane.clearMessage();
    // As a message will now have been displayed, don't keep the start page open.
    if (contentWin.multiMessageBrowser?.documentURI?.spec != STUB_URI) {
      MailE10SUtils.loadURI(contentWin.multiMessageBrowser, STUB_URI);
    }
    contentWin.multiMessageBrowser.hidden = false;

    // Should cancel most intempestive view refreshes, but only after we
    //  made sure the multimessage pane is shown. The logic behind this
    //  is the conversation in the message pane is already alive, and
    //  the gloda query is updating messages just fine, so we should not
    //  worry about messages which are not in the view.
    let newlySelectedUris = msgHdrs.map((m) => m.folder.getUriForMsg(m));
    let isSelectionThreaded = determineIfSelectionIsThreaded(contentWin);

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
      // console.debug(
      //   "Hey, know what? The selection hasn't changed, so we're good!"
      // );
      return;
    }

    // Remember the previously selected URIs now, so that if we get
    // a duplicate conversation, we don't try to start rending the same
    // conversation again whilst the previous one is still in progress.
    previouslySelectedUris = newlySelectedUris;
    previousIsSelectionThreaded = isSelectionThreaded;

    for (let msg of msgHdrs) {
      msgs.push(await context.extension.messageManager.convert(msg));
    }

    msgsChangedListeners.get(tabId)?.async(msgs);
  };
}

/**
 * Tell if a message is an RSS feed item or a news message.
 *
 * @param {nsIMsgDBHdr} msgHdr The message header
 * @returns {boolean}
 */
function msgHdrIsRssOrNews(msgHdr) {
  let server = msgHdr.folder.server;

  return (
    server instanceof Ci.nsIRssIncomingServer ||
    server instanceof Ci.nsINntpIncomingServer
  );
}
