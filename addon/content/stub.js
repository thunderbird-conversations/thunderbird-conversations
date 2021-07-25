/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global conversationStore:true */
import React from "react";
import ReactDOM from "react-dom";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { conversationApp } from "./reducer/reducer.js";
import { initialize } from "./reducer/reducer-deps.js";
import { ConversationWrapper } from "./components/conversation/conversationWrapper.jsx";

document.addEventListener(
  "DOMContentLoaded",
  () => {
    conversationStore = RTK.configureStore({
      reducer: conversationApp,
      middleware: RTK.getDefaultMiddleware(),
    });

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
            { store: conversationStore },
            React.createElement(ConversationWrapper)
          ),
          conversationContainer
        );
      })
      .catch(console.error);
  },
  { once: true }
);
