/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* import-globals-from quickReply.js */
/* import-globals-from reducer.js */
/* global Redux, ReactDOM, React, ReactRedux, ConversationWrapper,
          Log:true, masqueradeAsQuickCompose */

let store;
var { StringBundle } = ChromeUtils.import(
  "resource:///modules/StringBundle.js"
);
/* exported Services */
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var strings = new StringBundle(
  "chrome://conversations/locale/message.properties"
);

/* exported conversationDispatch */
function conversationDispatch(...args) {
  store.dispatch(...args);
}

// Below are event listeners for various actions. There is some logic
//  involved, and they may talk to other parts of the code.

// This property is now set from the outside. This allows stub.html to
//  be used either in a standalone tab or in the multimessage pane.
// let Conversations = window.top.Conversations;

const { msgUriToMsgHdr, msgHdrsMarkAsRead } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/msgHdrUtils.js"
);
const { Prefs } = ChromeUtils.import(
  "chrome://conversations/content/modules/prefs.js"
);
const { topMail3Pane } = ChromeUtils.import(
  "chrome://conversations/content/modules/misc.js"
);
const { setupLogging, dumpCallStack } = ChromeUtils.import(
  "chrome://conversations/content/modules/log.js"
);

Log = setupLogging("Conversations.Stub");
// Declare with var, not let, so that it's in the global scope, not the lexical scope.
/* exported isInTab */
var isInTab = false;

let oldPrint = window.print;

function printConversation(event) {
  for (let { message: m } of Conversations.currentConversation.messages) {
    m.dumpPlainTextForPrinting();
  }
  oldPrint();
}

window.print = printConversation;

document.addEventListener(
  "DOMContentLoaded",
  () => {
    store = Redux.createStore(conversationApp);

    const conversationContainer = document.getElementById(
      "conversationWrapper"
    );
    ReactDOM.render(
      React.createElement(
        ReactRedux.Provider,
        { store },
        React.createElement(ConversationWrapper)
      ),
      conversationContainer
    );
  },
  { once: true }
);

/**
 * That big event handler tries to parse URL query parameters, and then acts
 * upon these, by firing a conversation on its own. This is a very
 * stripped-down version of the logic that's in monkeypatch.js, and it
 * serves the purpose of being able to create a standalone conversation view
 * in a new tab.
 */
document.addEventListener(
  "DOMContentLoaded",
  () => {
    const params = new URL(document.location).searchParams;

    // Oh, are we expected to build a conversation on our own? Let's do it,
    // yay!
    if (params.has("urls")) {
      try {
        let scrollMode = params.get("scrollMode")
          ? parseInt(params.scrollMode)
          : Prefs.kScrollUnreadOrLast;
        /* If we start up Thunderbird with a saved conversation tab, then we
         * have no selected message. Fallback to the usual mode. */
        if (
          scrollMode == Prefs.kScrollSelected &&
          !topMail3Pane(window).gFolderDisplay.selectedMessage
        ) {
          scrollMode = Prefs.kScrollUnreadOrLast;
        }

        isInTab = true;
        if (window.frameElement) {
          window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
        }
        let mainWindow = topMail3Pane(window);
        // let willExpand = parseInt(params.get("willExpand"));
        let msgHdrs = params
          .get("urls")
          .split(",")
          .map(x => msgUriToMsgHdr(x))
          .filter(x => x != null && x.messageId);
        // It might happen that there are no messages left...
        if (!msgHdrs.length) {
          document.getElementById("messageList").textContent = strings.get(
            "messageMovedOrDeletedConversation"
          );
        } else {
          window.Conversations = {
            currentConversation: null,
            counter: 0,
          };
          let freshConversation = new mainWindow.Conversations.monkeyPatch._Conversation(
            window,
            msgHdrs,
            scrollMode,
            ++Conversations.counter
          );
          let browser = window.frameElement;
          // Because Thunderbird still hasn't fixed that...
          if (browser) {
            browser.setAttribute("context", "mailContext");
          }

          freshConversation.outputInto(window, function(aConversation) {
            // This is a stripped-down version of what's in monkeypatch.js,
            //  make sure the two are in sync!
            Conversations.currentConversation = aConversation;
            aConversation.completed = true;
            // TODO: Re-enable this.
            // registerQuickReply();
            // That's why we saved it before...
            // newComposeSessionByDraftIf();
            // TODO: expandQuickReply isn't defined anywhere. Should it be?
            // if (willExpand)
            //   expandQuickReply();
            // Create a new rule that will override the default rule, so that
            // the expanded quick reply is twice higher.
            document.body.classList.add("inTab");
            // Do this now so as to not defeat the whole expand/collapse
            // logic.
            if (Prefs.getBool("mailnews.mark_message_read.auto")) {
              setTimeout(function() {
                msgHdrsMarkAsRead(msgHdrs, true);
              }, Prefs.getInt("mailnews.mark_message_read.delay.interval") *
                Prefs.getBool("mailnews.mark_message_read.delay") *
                1000);
            }
          });
        }
      } catch (e) {
        Log.debug(e);
        dumpCallStack(e);
      }
    } else if (params.get("quickCompose")) {
      masqueradeAsQuickCompose();
    }
  },
  { once: true }
);

/* exported isQuickCompose */
var isQuickCompose = false;
