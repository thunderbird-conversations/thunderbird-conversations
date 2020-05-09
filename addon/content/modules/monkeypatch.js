/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MonkeyPatch"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  Conversation: "chrome://conversations/content/modules/conversation.js",
  Customizations: "chrome://conversations/content/modules/assistant.js",
  getIdentityForEmail: "chrome://conversations/content/modules/misc.js",
  getMail3Pane: "chrome://conversations/content/modules/misc.js",
  joinWordList: "chrome://conversations/content/modules/misc.js",
  msgHdrGetUri: "chrome://conversations/content/modules/misc.js",
  parseMimeLine: "chrome://conversations/content/modules/misc.js",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  setupLogging: "chrome://conversations/content/modules/misc.js",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "Log", () => {
  return setupLogging("Conversations.MonkeyPatch");
});

XPCOMUtils.defineLazyGetter(this, "browser", function() {
  return BrowserSim.getBrowser();
});

let shouldPerformUninstall;

function MonkeyPatch(window, windowId) {
  this._window = window;
  this._windowId = windowId;
  this._markReadTimeout = null;
  this._beingUninstalled = false;
  this._undoFuncs = [];
}

MonkeyPatch.prototype = {
  pushUndo(f) {
    this._undoFuncs.push(f);
  },

  undo(aReason) {
    let f;
    while ((f = this._undoFuncs.pop())) {
      try {
        f(aReason);
      } catch (ex) {
        console.error("Failed to undo some customization", ex);
      }
    }
  },

  applyOverlay: function _MonkeyPatch_applyOverlay(window) {
    // Wow! I love restartless! Now I get to create all the items by hand!

    // 1) Get a context menu in the multimessage
    window.document
      .getElementById("multimessage")
      .setAttribute("context", "mailContext");

    // 2) Tree column
    let treecol = window.document.createXULElement("treecol");
    [
      ["id", "betweenCol"],
      ["flex", "4"],
      ["persist", "width hidden ordinal"],
      ["label", browser.i18n.getMessage("between.columnName")],
      ["tooltiptext", browser.i18n.getMessage("between.columnTooltip")],
    ].forEach(function([k, v]) {
      treecol.setAttribute(k, v);
    });
    // Work around for Thunderbird not managing to restore the column
    // state properly any more for mixed-WebExtensions.
    // This is coupled with the `unload` handler below.
    window.setTimeout(() => {
      if (
        !Services.prefs.getBoolPref("conversations.betweenColumnVisible", true)
      ) {
        treecol.setAttribute("hidden", "true");
      } else {
        treecol.removeAttribute("hidden");
      }
    }, 1000);
    let parent3 = window.document.getElementById("threadCols");
    parent3.appendChild(treecol);
    this.pushUndo(() => parent3.removeChild(treecol));
    let splitter = window.document.createXULElement("splitter");
    splitter.classList.add("tree-splitter");
    parent3.appendChild(splitter);
    this.pushUndo(() => parent3.removeChild(splitter));
  },

  async registerColumn() {
    // This has to be the first time that the documentation on MDC
    //  1) exists and
    //  2) is actually relevant!
    //
    //            OMG !
    //
    // https://developer.mozilla.org/en/Extensions/Thunderbird/Creating_a_Custom_Column
    let window = this._window;

    // It isn't quite right to do this ahead of time, but it saves us having
    // to get the number of identities twice for every cell. Users don't often
    // add or remove identities/accounts anyway.
    const multipleIdentities =
      (await browser.convContacts.getIdentities()).length > 1;

    let participants = function(msgHdr) {
      try {
        // The array of people involved in this email.
        let people = [];
        // Helper for formatting; depending on the locale, we may need a different
        // for me as in "to me" or as in "from me".
        let format = function(x, p) {
          if (getIdentityForEmail(x.email)) {
            let display = p
              ? browser.i18n.getMessage("message.meBetweenMeAndSomeone")
              : browser.i18n.getMessage("message.meBetweenSomeoneAndMe");
            if (multipleIdentities) {
              display += " (" + x.email + ")";
            }
            return display;
          }
          return x.name || x.email;
        };
        // Add all the people found in one of the msgHdr's properties.
        let addPeople = function(prop, pos) {
          let line = msgHdr[prop];
          parseMimeLine(line, true).forEach(function(x) {
            people.push(format(x, pos));
          });
        };
        // We add everyone
        addPeople("author", true);
        addPeople("recipients", false);
        addPeople("ccList", false);
        addPeople("bccList", false);
        // Then remove duplicates
        let seenAlready = {};
        people = people.filter(function(x) {
          let r = !(x in seenAlready);
          seenAlready[x] = true;
          return r;
        });
        // And turn this into a human-readable line.
        if (people.length) {
          return joinWordList(people);
        }
      } catch (ex) {
        console.error("Error in the special column", ex);
      }
      return "-";
    };

    let columnHandler = {
      getCellText(row, col) {
        let msgHdr = window.gDBView.getMsgHdrAt(row);
        return participants(msgHdr);
      },
      getSortStringForRow(msgHdr) {
        return participants(msgHdr);
      },
      isString() {
        return true;
      },
      getCellProperties(row, col, props) {},
      getRowProperties(row, props) {},
      getImageSrc(row, col) {
        return null;
      },
      getSortLongForRow(hdr) {
        return 0;
      },
    };

    // The main window is loaded when the monkey-patch is applied
    Services.obs.addObserver(
      {
        observe(aMsgFolder, aTopic, aData) {
          window.gDBView.addColumnHandler("betweenCol", columnHandler);
        },
      },
      "MsgCreateDBView"
    );
    try {
      window.gDBView.addColumnHandler("betweenCol", columnHandler);
    } catch (e) {
      // This is really weird, but rkent does it for junquilla, and this solves
      //  the issue of enigmail breaking us... don't wanna know why it works,
      //  but it works.
      // After investigating, it turns out that without enigmail, we have the
      //  following sequence of events:
      // - jsm load
      // - onload
      // - msgcreatedbview
      // With enigmail, this sequence is modified
      // - jsm load
      // - msgcreatedbview
      // - onload
      // So our solution kinda works, but registering the thing at jsm load-time
      //  would work as well.
    }
    this.pushUndo(() => window.gDBView.removeColumnHandler("betweenCol"));

    window.addEventListener(
      "unload",
      () => {
        let col = window.document.getElementById("betweenCol");
        if (col) {
          let isHidden = col.getAttribute("hidden");
          Services.prefs.setBoolPref(
            "conversations.betweenColumnVisible",
            isHidden != "true"
          );
        }
      },
      { once: true }
    );
  },

  clearTimer() {
    // If we changed conversations fast, clear the timeout
    if (this.markReadTimeout) {
      this._window.clearTimeout(this.markReadTimeout);
    }
  },

  registerUndoCustomizations() {
    shouldPerformUninstall = true;

    this.pushUndo(aReason => {
      // We don't want to undo all the customizations in the case of an
      // upgrade... but if the user disables the conversation view, or
      // uninstalls the addon, then we should revert them indeed.
      if (shouldPerformUninstall) {
        // Switch to a 3pane view (otherwise the "display threaded"
        // customization is not reverted)
        let mainWindow = getMail3Pane();
        let tabmail = mainWindow.document.getElementById("tabmail");
        if (tabmail.tabContainer.selectedIndex != 0) {
          tabmail.tabContainer.selectedIndex = 0;
        }
        this.undoCustomizations();
        // Since this is called once per window, we don't want to uninstall
        // multiple times...
        shouldPerformUninstall = false;
      }
    });
  },

  undoCustomizations() {
    let uninstallInfos = JSON.parse(Prefs.uninstall_infos);
    for (let [k, v] of Object.entries(Customizations)) {
      if (k in uninstallInfos) {
        try {
          Log.debug("Uninstalling", k, uninstallInfos[k]);
          v.uninstall(uninstallInfos[k]);
        } catch (ex) {
          console.error("Failed to uninstall", k, ex);
        }
      }
    }
    // TODO: We may need to fix this to pass data back to local storage, but
    // generally if we're being uninstalled, we'll be removing the local storage
    // anyway, so maybe this is ok? Or do we need to handle the disable case?
    // Prefs.setString("conversations.uninstall_infos", "{}");
  },

  async apply() {
    let window = this._window;
    // First of all: "apply" the "overlay"
    this.applyOverlay(window);

    let self = this;
    let htmlpane = window.document.getElementById("multimessage");
    let oldSummarizeThread = window.summarizeThread;

    // Register our new column type
    await this.registerColumn();

    // Undo all our customizations at uninstall-time
    this.registerUndoCustomizations();

    let previouslySelectedUris = [];
    let previousIsSelectionThreaded = null;

    // This one completely nukes the original summarizeThread function, which is
    //  actually the entry point to the original ThreadSummary class.
    window.summarizeThread = function _summarizeThread_patched(
      aSelectedMessages,
      aListener
    ) {
      if (!aSelectedMessages.length) {
        return;
      }

      if (!window.gMessageDisplay.visible) {
        Log.debug("Message pane is hidden, not fetching...");
        return;
      }

      window.gMessageDisplay.singleMessageDisplay = false;

      window.gSummaryFrameManager.loadAndCallback(Prefs.kStubUrl, function(
        isRefresh
      ) {
        // See issue #673
        if (htmlpane.contentDocument && htmlpane.contentDocument.body) {
          htmlpane.contentDocument.body.hidden = false;
        }

        if (isRefresh) {
          // Invalidate the previous selection
          previouslySelectedUris = [];
          // Invalidate any remaining conversation
          window.Conversations.currentConversation = null;
          // Make the stub aware of the Conversations object it's currently
          //  representing.
          htmlpane.contentWindow.Conversations = window.Conversations;
          // The DOM window is fresh, it needs an event listener to forward
          //  keyboard shorcuts to the main window when the conversation view
          //  has focus.
          // It's crucial we register a non-capturing event listener here,
          //  otherwise the individual message nodes get no opportunity to do
          //  their own processing.
          htmlpane.contentWindow.addEventListener("keypress", function(event) {
            try {
              window.dispatchEvent(event);
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
          let newlySelectedUris = aSelectedMessages.map(m => msgHdrGetUri(m));
          let isSelectionThreaded = await browser.convMsgWindow.isSelectionThreaded(
            this._windowId
          );

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
            Services.obs.notifyObservers(null, "Conversations", "Displayed");
            return;
          }
          // Remember the previously selected URIs now, so that if we get
          // a duplicate conversation, we don't try to start rending the same
          // conversation again whilst the previous one is still in progress.
          previouslySelectedUris = newlySelectedUris;
          previousIsSelectionThreaded = isSelectionThreaded;

          let freshConversation = new Conversation(
            window,
            aSelectedMessages,
            isSelectionThreaded,
            ++window.Conversations.counter
          );
          Log.debug("New conversation", freshConversation.counter);
          if (window.Conversations.currentConversation) {
            Log.debug(
              "Current conversation is",
              window.Conversations.currentConversation.counter
            );
          } else {
            Log.debug("First conversation");
          }
          freshConversation.outputInto(htmlpane.contentWindow, async function(
            aConversation
          ) {
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
            Log.assert(
              aConversation.isSelectionThreaded == isSelectionThreaded,
              "Someone forgot to put the right scroll mode!"
            );
            // So we force a GC cycle if we change conversations, so that the
            //  previous collection is actually deleted and we don't vomit a
            //  ton of errors from the listener that tries to modify the DOM
            //  nodes and fails at it because they don't exist anymore.
            let needsGC =
              window.Conversations.currentConversation &&
              window.Conversations.currentConversation.counter !=
                aConversation.counter;
            let isDifferentConversation =
              !window.Conversations.currentConversation ||
              window.Conversations.currentConversation.counter !=
                aConversation.counter;
            // Make sure we have a global root --> conversation --> persistent
            //  query chain to prevent the Conversation object (and its inner
            //  query) to be collected. The Conversation keeps watching the
            //  Gloda query for modified items (read/unread, starred, tags...).
            window.Conversations.currentConversation = aConversation;
            if (isDifferentConversation) {
              // Here, put the final touches to our new conversation object.
              // TODO: Maybe re-enable this.
              // htmlpane.contentWindow.newComposeSessionByDraftIf();
              aConversation.completed = true;
              // TODO: Re-enable this.
              // htmlpane.contentWindow.registerQuickReply();
            }
            if (needsGC) {
              Cu.forceGC();
            }

            Services.obs.notifyObservers(null, "Conversations", "Displayed");

            // Make sure we respect the user's preferences.
            if (Services.prefs.getBoolPref("mailnews.mark_message_read.auto")) {
              self.markReadTimeout = window.setTimeout(async function() {
                // The idea is that usually, we're selecting a thread (so we
                //  have kScrollUnreadOrLast). This means we mark the whole
                //  conversation as read. However, sometimes the user selects
                //  individual messages. In that case, don't do something weird!
                //  Just mark the selected messages as read.
                if (isSelectionThreaded) {
                  // Did we juste change conversations? If we did, it's ok to
                  //  mark as read. Otherwise, it's not, since we may silently
                  //  mark new messages as read.
                  if (isDifferentConversation) {
                    Log.debug("Marking the whole conversation as read");
                    for (const m of aConversation.messages) {
                      if (!m.message.read) {
                        await browser.messages.update(m.message._id, {
                          read: true,
                        });
                      }
                    }
                  }
                } else {
                  // We don't seem to have a reflow when the thread is expanded
                  //  so no risk of silently marking conversations as read.
                  Log.debug("Marking selected messages as read");
                  for (const msgHdr of aSelectedMessages) {
                    const id = await browser.conversations.getMessageIdForUri(
                      msgHdrGetUri(msgHdr)
                    );
                    if (!msgHdr.read) {
                      await browser.messages.update(id, {
                        read: true,
                      });
                    }
                  }
                }
                self.markReadTimeout = null;
              }, Services.prefs.getIntPref(
                "mailnews.mark_message_read.delay.interval"
              ) *
                Services.prefs.getBoolPref("mailnews.mark_message_read.delay") *
                1000);
            }
          });
        })().catch(console.error);
      });
    };
    this.pushUndo(() => (window.summarizeThread = oldSummarizeThread));

    // Because we want to replace the standard message reader, we need to always
    //  fire up the conversation view instead of deferring to the regular
    //  display code. The trick is that re-using the original function's name
    //  allows us to intercept the calls to the thread summary in regular
    //  situations (where a normal thread summary would kick in) as a
    //  side-effect. That means we don't need to hack into gMessageDisplay too
    //  much.
    let originalOnSelectedMessagesChanged =
      window.MessageDisplayWidget.prototype.onSelectedMessagesChanged;
    window.MessageDisplayWidget.prototype.onSelectedMessagesChanged = function _onSelectedMessagesChanged_patched() {
      try {
        if (!this.active) {
          return true;
        }
        window.ClearPendingReadTimer();
        self.clearTimer();

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
          originalOnSelectedMessagesChanged.call(this);
        } else if (selectedCount == 1) {
          // Here starts the part where we modify the original code.
          let msgHdr = this.folderDisplay.selectedMessage;
          // We can't display NTTP messages and RSS messages properly yet, so
          // leave it up to the standard message reader. If the user explicitely
          // asked for the old message reader, we give up as well.
          if (msgHdrIsRss(msgHdr) || msgHdrIsNntp(msgHdr)) {
            // Use the default pref.
            if (Services.prefs.getBoolPref("mailnews.mark_message_read.auto")) {
              self.markReadTimeout = window.setTimeout(async function() {
                Log.debug("Marking as read:", msgHdr);
                const id = await browser.conversations.getMessageIdForUri(
                  msgHdrGetUri(msgHdr)
                );
                if (!msgHdr.read) {
                  await browser.messages.update(id, {
                    read: true,
                  });
                }
                self.markReadTimeout = null;
              }, Services.prefs.getIntPref(
                "mailnews.mark_message_read.delay.interval"
              ) *
                Services.prefs.getBoolPref("mailnews.mark_message_read.delay") *
                1000);
            }
            this.singleMessageDisplay = true;
            return false;
          }
          // Otherwise, we create a thread summary.
          // We don't want to call this._showSummary because it has a built-in check
          // for this.folderDisplay.selectedCount and returns immediately if
          // selectedCount == 1
          this.singleMessageDisplay = false;
          window.summarizeThread(this.folderDisplay.selectedMessages, this);
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
    this.pushUndo(
      () =>
        (window.MessageDisplayWidget.prototype.onSelectedMessagesChanged = originalOnSelectedMessagesChanged)
    );

    Log.debug("Monkey patch successfully applied.");
  },
};

/**
 * Tell if a message is an RSS feed iteme
 * @param {nsIMsgDbHdr} msgHdr The message header
 * @return {Bool}
 */
function msgHdrIsRss(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsIRssIncomingServer;
}

/**
 * Tell if a message is a NNTP message
 * @param {nsIMsgDbHdr} msgHdr The message header
 * @return {Bool}
 */
function msgHdrIsNntp(msgHdr) {
  return msgHdr.folder.server instanceof Ci.nsINntpIncomingServer;
}
