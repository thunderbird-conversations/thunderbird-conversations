/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global BrowserSim */
// eslint-disable-next-line import/no-unassigned-import
import "./components/svgIcon.mjs";
import React from "react";
import ReactDOMClient from "react-dom/client";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { conversationApp } from "./reducer/reducer.mjs";
import { ConversationWrapper } from "./components/conversation/conversationWrapper.mjs";
import { controllerActions } from "./reducer/controllerActions.mjs";
import { summarySlice } from "./reducer/reducerSummary.mjs";

let gStore;

function handlePrefUpdate(value) {
  gStore.dispatch(
    summarySlice.actions.setDarkReaderEnabled({
      darkReaderEnabled: value,
    })
  );
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    if (BrowserSim) {
      globalThis.browser = await BrowserSim.getBrowserAsync();
    }

    let store = RTK.configureStore({
      reducer: conversationApp,
    });

    // Once we can potentially load in a WebExtension scope, then we should
    // be able to remove this.
    const conversationContainer = document.getElementById(
      "conversationWrapper"
    );
    let root = ReactDOMClient.createRoot(conversationContainer);
    root.render(
      React.createElement(
        ReactRedux.Provider,
        { store },
        React.createElement(ConversationWrapper)
      )
    );

    // Kick everything off.
    store.dispatch(controllerActions.waitForStartup());
    gStore = store;

    browser.conversations.onCorePrefChanged.addListener(
      handlePrefUpdate,
      "mail.dark-reader.enabled"
    );
  },
  { once: true }
);

document.addEventListener("unload", () => {
  browser.conversations.onCorePrefChanged.removeListener(
    handlePrefUpdate,
    "mail.dark-reader.enabled"
  );
});
