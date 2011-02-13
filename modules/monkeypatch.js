/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

var EXPORTED_SYMBOLS = ['MonkeyPatch']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle

Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/assistant.js");
Cu.import("resource://conversations/misc.js"); // for joinWordList
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/log.js");

const kStubUrl = "chrome://conversations/content/stub.xhtml";

const observerService = Cc["@mozilla.org/observer-service;1"]
                        .getService(Ci.nsIObserverService);

let strings = new StringBundle("chrome://conversations/locale/message.properties");

let Log = setupLogging("Conversations.MonkeyPatch");

let conversationTabType = {
  name: "conversationTab",
  perTabPanel: "vbox",
  lastId: 0,

  modes: {
    conversationTab: {
      type: "conversationTab",
      maxTabs: 10
    }
  },

  // Always open new conversation windows. Not true if we try to edit a draft that
  // already has an associated conversation window open, but that's for later...
  shouldSwitchTo: function onSwitchTo() {
    return -1;
  },

  openTab: function onTabOpened(aTab, aArgs) {
    let window = getMail3Pane();

    // First clone the page and set up the basics.
    let browser = window.document.getElementById("dummychromebrowser").cloneNode(true);
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("id", "conversationTab-" + this.lastId);
    browser.setAttribute("onclick", "specialTabs.defaultClickHandler(event);");
    browser.data = aArgs;
    browser.data.tabObject = aTab;

    // Done.
    aTab.panel.appendChild(browser);
    aTab.browser = browser;

    // Now set up the listeners.
    this._setUpTitleListener(aTab);
    this._setUpCloseWindowListener(aTab);

    // Now start loading the content.
    aTab.title = "Conversation View";
    browser.addEventListener("load", function _onload (event) {
      browser.removeEventListener("load", _onload, true);
      aArgs.onLoad(event, browser);
    }, true);
    browser.loadURI(kStubUrl);

    this.lastId++;
  },

  closeTab: function onTabClosed(aTab) {
    aTab.browser.removeEventListener("DOMTitleChanged",
                                     aTab.titleListener, true);
    aTab.browser.removeEventListener("DOMWindowClose",
                                     aTab.closeListener, true);
    aTab.browser.destroy();
  },

  saveTabState: function onSaveTabState(aTab) {
  },

  showTab: function onShowTab(aTab) {
  },

  persistTab: function onPersistTab(aTab) {
    // TODO save the current tab's status. Save the msgHdr through its URI
  },

  restoreTab: function onRestoreTab(aTabmail, aPersistedState) {
    // TODO create a new tab with the same status...
  },

  onTitleChanged: function onTitleChanged(aTab) {
    aTab.title = aTab.browser.contentDocument.title;
  },

  supportsCommand: function supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      default:
        return false;
    }
  },

  doCommand: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_printSetup":
        PrintUtils.showPageSetup();
        break;
      case "cmd_print":
        PrintUtils.print();
        break;
      // XXX print preview not currently supported - bug 497994 to implement.
      //case "cmd_printpreview":
      //  PrintUtils.printPreview();
      //  break;
    }
  },

  getBrowser: function getBrowser(aTab) {
    return aTab.browser;
  },

  // Internal function used to set up the title listener on a content tab.
  _setUpTitleListener: function setUpTitleListener(aTab) {
    function onDOMTitleChanged(aEvent) {
      getMail3Pane()
        .document.getElementById("tabmail").setTabTitle(aTab);
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.titleListener = onDOMTitleChanged;
    // Add the listener.
    aTab.browser.addEventListener("DOMTitleChanged",
                                  aTab.titleListener, true);
  },
  /**
   * Internal function used to set up the close window listener on a content
   * tab.
   */
  _setUpCloseWindowListener: function setUpCloseWindowListener(aTab) {
    function onDOMWindowClose(aEvent) {
      try {
        if (!aEvent.isTrusted)
          return;

        // Redirect any window.close events to closing the tab. As a 3-pane tab
        // must be open, we don't need to worry about being the last tab open.
        
        getMail3Pane()
          document.getElementById("tabmail").closeTab(aTab);
        aEvent.preventDefault();
      } catch (e) {
        logException(e);
      }
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.closeListener = onDOMWindowClose;
    // Add the listener.
    aTab.browser.addEventListener("DOMWindowClose",
                                  aTab.closeListener, true);
  }
};

function MonkeyPatch(aWindow, aConversation) {
  this._Conversation = aConversation;
  this._wantedUrl = "";
  this._window = aWindow;
  this._markReadTimeout = null;
  this._beingUninstalled = false;
}

MonkeyPatch.prototype = {

  registerColumn: function _MonkeyPatch_registerColumn () {
    // This has to be the first time that the documentation on MDC
    //  1) exists and
    //  2) is actually relevant!
    // 
    //            OMG !
    //
    // https://developer.mozilla.org/en/Extensions/Thunderbird/Creating_a_Custom_Column
    let window = this._window;

    let participants = function (msgHdr) {
      let format = function (x, p) {
        if (x.email in gIdentities)
          return p ? strings.get("meFrom") : strings.get("meTo");
        else
          return x.name || x.email;
      };
      let seenAlready = {};
      let r = [
        [format(x, p) for each ([, x] in Iterator(parseMimeLine(msgHdr[prop])))]
        for each ([prop, p] in [["mime2DecodedAuthor", true], ["mime2DecodedRecipients", false], ["ccList", false], ["bccList", false]])
        if (msgHdr[prop])
      ].filter(function (x) {
        // Wow, a nice side-effect, I just hope the implementation of filter is
        //  as I think it is. Yes, I live dangerously!
        let r = !(x in seenAlready);
        seenAlready[x] = true;
        return r;
      }).reduce(function (x, y) x.concat(y));
      return joinWordList(r);
    };

    let columnHandler = {
      getCellText: function(row, col) {
        let msgHdr = window.gDBView.getMsgHdrAt(row);
        return participants(msgHdr);    
      },
      getSortStringForRow: function(hdr) {
        return participants(msgHdr);
      },
      isString: function() {
        return true;
      },
      getCellProperties: function(row, col, props) {},
      getRowProperties: function(row, props) {},
      getImageSrc: function(row, col) {
        return null;
      },
      getSortLongForRow: function(hdr) {
        return 0;
      }
    };

    // The main window is loaded when the monkey-patch is applied
    let observerService = Cc["@mozilla.org/observer-service;1"]
                          .getService(Ci.nsIObserverService);
    observerService.addObserver({
      observe: function(aMsgFolder, aTopic, aData) {  
        Log.debug("MsgCreateDBView -- registering our custom column handler");
        window.gDBView.addColumnHandler("betweenCol", columnHandler);
      }
    }, "MsgCreateDBView", false);
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
      // - onlaod
      // So our solution kinda works, but registering the thing at jsm load-time
      //  would work as well.
    }
  },

  clearTimer: function () {
    // If we changed conversations fast, clear the timeout
    if (this.markReadTimeout)
      this._window.clearTimeout(this.markReadTimeout);
  },

  // Don't touch. Too tricky.
  determineScrollMode: function () {
    let window = this._window;
    let scrollMode = Prefs.kScrollUnreadOrLast;

    let isExpanded = false;
    let msgIndex = window.gFolderDisplay ? window.gFolderDisplay.selectedIndices[0] : -1;
    if (msgIndex >= 0) {
      try {
        let rootIndex = window.gDBView
          .findIndexOfMsgHdr(window.gDBView.getThreadContainingIndex(msgIndex).getChildHdrAt(0), false);
        if (rootIndex >= 0) {
          isExpanded = window.gDBView.isContainer(rootIndex)
            && !window.gFolderDisplay.view.isCollapsedThreadAtIndex(rootIndex);
        }
      } catch (e) {
        Log.debug("Error in the onLocationChange handler "+e+"\n");
        dumpCallStack(e);
      }
    } 
    if (window.gFolderDisplay.view.showThreaded) {
      // The || is for the wicked case that Standard8 sent me a screencast for.
      // This makes sure we *always* mark the selected message as read, even in
      //  the tricky case where we recycle a conversation \emph{and} end up with
      //  only one message left in the thread pane.
      if (isExpanded || window.gFolderDisplay.selectedMessages.length == 1)
        scrollMode = Prefs.kScrollSelected;
      else
        scrollMode = Prefs.kScrollUnreadOrLast;
    } else {
      scrollMode = Prefs.kScrollSelected;
    }

    Log.debug("Scroll mode", scrollMode, "is expanded?", isExpanded);

    return scrollMode;
  },

  watchUninstall: function () {
    AddonManager.addAddonListener(this);
    observerService.addObserver(this, "mail-startup-done", false);
    observerService.addObserver(this, "quit-application-granted", false);
    observerService.addObserver(this, "quit-application-requested", false);
  },

  doUninstall: function () {
    let uninstallInfos = JSON.parse(Prefs.getString("conversations.uninstall_infos"));
    for each (let [k, v] in Iterator(Customizations)) {
      if (k in uninstallInfos) {
        try {
          Log.debug("Uninstalling", k, uninstallInfos[k]);
          v.uninstall(uninstallInfos[k]);
        } catch (e) {
          Log.error("Failed to uninstall", k, e);
          dumpCallStack(e);
        }
      }
    }
    Prefs.setString("conversations.uninstall_infos", "{}");
    Prefs.setInt("conversations.version", 0);
  },

  // nsIObserver
  observe: function (aSubject, aTopic, aData) {
    Log.debug("Observing", aTopic, aData);
    // Why do we need such a convoluted shutdown procedure? The thing is, unless
    //  the current tab is the standard folder view, customizations such as the
    //  folder view columns won't take effect. So we need to switch to the first
    //  tab.
    // Next issue: this takes some time, so we must do this while we can still
    //  cancel the shutdown procedure, and then do the shutdown again, after a
    //  small timeout, the time for Thunderbird to switch to the correct tab.
    if (aTopic == "quit-application-requested" && this._beingUninstalled) {
      let mainWindow = getMail3Pane();
      let tabmail = mainWindow.document.getElementById("tabmail");
      if (tabmail.tabContainer.selectedIndex != 0) {
        tabmail.tabContainer.selectedIndex = 0;
        aSubject.QueryInterface(Ci.nsISupportsPRBool);
        // Cancel shutdown, and leave some time for Thunderbird to setup the
        //  view.
        aSubject.data = true;
        if (aData == "restart")
          mainWindow.setTimeout(function () { mainWindow.Application.restart(); }, 1000);
        else
          mainWindow.setTimeout(function () { mainWindow.Application.quit(); }, 1000);
      }
    }

    // Now we assume the view is setup, and we can actually do our little
    //  uninstall stuff.
    if (aTopic == "quit-application-granted" && this._beingUninstalled)
      this.doUninstall();
  },

  // AddonListener
  onEnabling: function (addon, needsRestart) {
  },
  onEnabled: function (addon) {
  },
  onDisabling: function (addon, needsRestart) {
  },
  onDisabled: function (addon) {
  },
  onInstalling: function (addon, needsRestart) {
  },
  onInstalled: function (addon) {
  },
  onUninstalled: function(addon) {
  },
  onUninstalling: function(addon) {
    Log.debug(addon.id);
    if (addon.id == "gconversation@xulforum.org") {
      this._beingUninstalled = true;
      Log.debug("Being uninstalled ?", this._beingUninstalled);
    }
  },
  onOperationCancelled: function(addon) {
    if (addon.id == "gconversation@xulforum.org") {
      this._beingUninstalled = (addon.pendingOperations & AddonManager.PENDING_UNINSTALL) != 0;
      Log.debug("Being uninstalled ?", this._beingUninstalled);
    }
  },
  onPropertyChanged: function (addon, properties) {
  },

  apply: function () {
    let window = this._window;
    let self = this;
    let htmlpane = window.document.getElementById("multimessage");
    let oldSummarizeMultipleSelection = window["summarizeMultipleSelection"];

    // Nuke the reference to any old message window. Happens if we close the
    //  main window and open a new one without restarting Thunderbird.
    getMail3Pane(true);

    // Do this at least once at overlay load-time
    fillIdentities();

    // Register our new tab type
    let tabmail = window.document.getElementById("tabmail");
    tabmail.registerTabType(conversationTabType);

    // Register our new column type
    this.registerColumn();

    // Register the uninstall handler
    this.watchUninstall();
    /* window.setTimeout(function () {
      self.onUninstalled({ id: "gconversation@xulforum.org" })
    }, 1000); // XXX debug */

    // Below is the code that intercepts the message display logic, and reroutes
    //  the control flow to our conversation reader.

    // Because we're not even fetching the conversation when the message pane is
    //  hidden, we need to trigger it manually when it's un-hidden.
    window.addEventListener("messagepane-unhide",
      function () {
        Log.debug("messagepane-unhide");
        window.summarizeThread(window.gFolderDisplay.selectedMessages);
      }, true);

    // This nice little wrapper makes sure that the multimessagepane points to
    //  the given URL before moving on. It takes a continuation, and an optional
    //  third argument that is to be run in case we loaded a fresh page.
    let ensureLoadedAndRun = function (aLocation, k, onRefresh) {
      if (!window.gMessageDisplay.visible) {
        Log.debug("Message pane is hidden, not fetching...");
        return;
      }

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

    let previouslySelectedUris = [];

    // This one completely nukes the original summarizeThread function, which is
    //  actually the entry point to the original ThreadSummary class.
    window.summarizeThread =
      function _summarizeThread_patched (aSelectedMessages, aListener) {
        if (!aSelectedMessages.length)
          return;

        ensureLoadedAndRun(kStubUrl, function () {
          try {
            // Should cancel most intempestive view refreshes, but only after we
            //  made sure the multimessage pane is shown. The logic behind this
            //  is the conversation in the message pane is already alive, and
            //  the gloda query is updating messages just fine, so we should not
            //  worry about message which are not in the view.
            let newlySelectedUris = [msgHdrGetUri(x) for each (x in aSelectedMessages)];
            if (arrayEquals(newlySelectedUris, previouslySelectedUris)) {
              Log.debug("Hey, know what? The selection hasn't changed, so we're good!");
              return;
            }

            let scrollMode = self.determineScrollMode();
            let freshConversation = new self._Conversation(
              window,
              aSelectedMessages,
              scrollMode,
              ++window.Conversations.counter
            );
            freshConversation.outputInto(htmlpane, function (aConversation) {
              // So we've been promoted to be the new conversation! Remember
              //  that and update the currently selected URIs to prevent further
              //  reflows.
              previouslySelectedUris = newlySelectedUris;
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
              Log.debug("Conversation", aConversation.counter, "is the new one. Scroll mode:", aConversation.scrollMode);
              Log.assert(aConversation.scrollMode == scrollMode, "Someone forgot to put the right scroll mode!");
              // So we force a GC cycle if we change conversations, so that the
              //  previous collection is actually deleted and we don't vomit a
              //  ton of errors from the listener that tries to modify the DOM
              //  nodes and fails at it because they don't exist anymore.
              let needsGC = window.Conversations.currentConversation
                && (window.Conversations.currentConversation.counter != aConversation.counter);
              let isDifferentConversation = !window.Conversations.currentConversation
                  || (window.Conversations.currentConversation.counter != aConversation.counter);
              window.Conversations.currentConversation = aConversation;
              if (isDifferentConversation) {
                // Here, put the final touches to our new conversation object.
                htmlpane.contentWindow.loadDraft();
                aConversation.completed = true;
                htmlpane.contentWindow.registerQuickReply();
              }
              if (needsGC)
                Cu.forceGC();

              // Make sure we respect the user's preferences.
              self.markReadTimeout = window.setTimeout(function () {
                // The idea is that usually, we're selecting a thread (so we
                //  have kScrollUnreadOrLast). This means we mark the whole
                //  conversation as read. However, sometimes the user selects
                //  individual messages. In that case, don't do something weird!
                //  Just mark the selected messages as read.
                if (scrollMode == Prefs.kScrollUnreadOrLast) {
                  // Did we juste change conversations? If we did, it's ok to
                  //  mark as read. Otherwise, it's not, since we may silently
                  //  mark new messages as read.
                  if (isDifferentConversation) {
                    Log.debug("Marking the whole conversation as read");
                    aConversation.read = true;
                  }
                } else if (scrollMode == Prefs.kScrollSelected) {
                  // We don't seem to have a reflow when the thread is expanded
                  //  so no risk of silently marking conversations as read.
                  Log.debug("Marking selected messages as read");
                  msgHdrsMarkAsRead(aSelectedMessages, true);
                } else {
                  Log.assert(false, "GIVE ME ALGEBRAIC DATA TYPES!!!");
                }
                self.markReadTimeout = null;
                // Hehe, do that now, because the conversation potentially
                //  includes messages that are not in the gloda collection and
                //  that do not trigger the "conversation updated" notification.
                aConversation._updateConversationButtons();
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
          htmlpane.contentWindow.addEventListener("keypress", function (event) {
            try {
              window.dispatchEvent(event);
            } catch (e) {
              Log.debug("We failed to dispatch the event, don't know why...", e);
            }
          }, false);
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
    window.MessageDisplayWidget.prototype.onSelectedMessagesChanged =
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
