/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* import-globals-from quickReply.js */
/* import-globals-from reducer.js */
/* global RTK, ReactDOM, React, ReactRedux, ConversationWrapper */

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

document.addEventListener(
  "DOMContentLoaded",
  () => {
    // Call initalize to set up the `browser` variable before we do anything.
    // Once we can potentially load in a WebExtension scope, then we should
    // be able to remove this.
    initialize()
      .then(() => {
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
      })
      .catch(console.error);
  },
  { once: true }
);
