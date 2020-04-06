/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* import-globals-from quickReply.js */
/* import-globals-from reducer.js */
/* global RTK, ReactDOM, React, ReactRedux, ConversationWrapper,
          masqueradeAsQuickCompose */

const store = RTK.configureStore({
  reducer: conversationApp,
  // XXX bug #1461. Remove this code when that bug is resolved.
  //
  // By default RTK includes the serializableCheck
  // Redux middleware which makes sure the Redux state
  // and all Redux actions are serializable. We want this to
  // be the case in the long run, but there are a few places
  // where it will take more work to eliminate the non-serializable
  // data. As a temporary workaround, exclude that data from the
  // checks.
  middleware: RTK.getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: [
        "MSG_STREAM_MSG",
        "MSG_STREAM_LOAD_FINISHED",
        "REPLACE_CONVERSATION_DETAILS",
      ],
      ignoredPaths: ["summary.conversation"],
    },
  }),
});

/* exported conversationDispatch */
function conversationDispatch(...args) {
  store.dispatch(...args);
}

// Below are event listeners for various actions. There is some logic
//  involved, and they may talk to other parts of the code.

// This property is now set from the outside. This allows stub.html to
//  be used either in a standalone tab or in the multimessage pane.
// let Conversations = window.top.Conversations;

XPCOMUtils.defineLazyModuleGetters(this, {
  msgUriToMsgHdr:
    "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  msgHdrsMarkAsRead:
    "chrome://conversations/content/modules/stdlib/msgHdrUtils.js",
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
});

const { ConversationUtils, Conversation } = ChromeUtils.import(
  "chrome://conversations/content/modules/conversation.js"
);

// TODO: Once the WebExtension parts work themselves out a bit more,
// determine if this is worth sharing via a shared module with the background
// scripts, or if it doesn't need it.
const kScrollUnreadOrLast = 0;
const kScrollSelected = 1;

// Declare with var, not let, so that it's in the global scope, not the lexical scope.
/* exported isInTab */
var isInTab = false;

let oldPrint = window.print;

// This provides simulation for the WebExtension environment whilst we're still
// being loaded in a privileged process.
/* exported browser */
let browser = ConversationUtils.getBrowser();

function printConversation(event) {
  for (let { message: m } of Conversations.currentConversation.messages) {
    m.dumpPlainTextForPrinting();
  }
  oldPrint();
}

window.print = printConversation;

// When moving to a WebExtension page this can simply be moved to CSS (see
// options.css).
document.documentElement.setAttribute(
  "dir",
  browser.conversations.getLocaleDirection()
);

document.addEventListener(
  "DOMContentLoaded",
  () => {
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

function setupConversationInTab(params) {
  let scrollMode = params.get("scrollMode");
  if (scrollMode) {
    scrollMode = parseInt(scrollMode);
  } else {
    scrollMode = kScrollUnreadOrLast;
  }
  // If we start up Thunderbird with a saved conversation tab, then we
  // have no selected message. Fallback to the usual mode.
  if (
    scrollMode == kScrollSelected &&
    !topMail3Pane(window).gFolderDisplay.selectedMessage
  ) {
    scrollMode = kScrollUnreadOrLast;
  }

  isInTab = true;
  if (window.frameElement) {
    window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
  }
  // let willExpand = parseInt(params.get("willExpand"));
  let msgHdrs = params
    .get("urls")
    .split(",")
    .map(x => msgUriToMsgHdr(x))
    .filter(x => x != null && x.messageId);
  // It might happen that there are no messages left...
  if (!msgHdrs.length) {
    document.getElementById(
      "messageList"
    ).textContent = browser.i18n.getMessage(
      "message.movedOrDeletedConversation"
    );
  } else {
    window.Conversations = {
      currentConversation: null,
      counter: 0,
    };
    let freshConversation = new Conversation(
      window,
      msgHdrs,
      scrollMode,
      ++Conversations.counter
    );
    let browserFrame = window.frameElement;
    // Because Thunderbird still hasn't fixed that...
    if (browserFrame) {
      browserFrame.setAttribute("context", "mailContext");
    }

    freshConversation.outputInto(window, async function(aConversation) {
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
      if (
        await browser.conversations.getCorePref(
          "mailnews.mark_message_read.auto"
        )
      ) {
        setTimeout(function() {
          msgHdrsMarkAsRead(msgHdrs, true);
        }, (await browser.conversations.getCorePref(
          "mailnews.mark_message_read.delay.interval"
        )) *
          (await browser.conversations.getCorePref(
            "mailnews.mark_message_read.delay"
          )) *
          1000);
      }
    });
  }
}

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
      function checkStarted() {
        let mainWindow = topMail3Pane(window);
        if (
          mainWindow.Conversations &&
          mainWindow.Conversations.monkeyPatch &&
          mainWindow.Conversations.monkeyPatch.finishedStartup
        ) {
          try {
            setupConversationInTab(params);
          } catch (ex) {
            console.error(ex);
          }
        } else {
          setTimeout(checkStarted, 100);
        }
      }
      checkStarted();
    } else if (params.get("quickCompose")) {
      masqueradeAsQuickCompose();
    }
  },
  { once: true }
);

/* exported isQuickCompose */
var isQuickCompose = false;
