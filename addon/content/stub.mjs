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
import { MessageList } from "./components/message/messageList.mjs";
import { controllerActions } from "./reducer/controllerActions.mjs";
import { summarySlice } from "./reducer/reducerSummary.mjs";

/**
 * @import {ConversationHeader} from "./components/conversation/conversationHeader.mjs"
 */

let gStore;

function handlePrefUpdate(value) {
  gStore.dispatch(
    summarySlice.actions.setDarkReaderEnabled({
      darkReaderEnabled: value,
    })
  );
}

let previousOS = "";
let previousTweakChrome = false;
let previousMessageNotFound = false;

/** @type {ConversationHeader} */
let conversationHeader;

function handleStoreUpdate() {
  let state = gStore.getState();

  if (previousMessageNotFound != state.summary.messageNotFound) {
    const msgNotFound = document.getElementById("messageNotFound");
    const conversationWrapper = document.getElementById("conversationWrapper");
    if (state.summary.messageNotFound) {
      msgNotFound.textContent = browser.i18n.getMessage(
        "message.movedOrDeletedConversation"
      );
      msgNotFound.classList.remove("hidden");
      conversationWrapper.classList.add("hidden");
    } else {
      msgNotFound.classList.add("hidden");
      conversationWrapper.classList.remove("hidden");
    }
  }

  if (
    state.summary.OS != previousOS ||
    state.summary.prefs.tweakChrome != previousTweakChrome
  ) {
    const html = /** @type {HTMLHtmlElement} */ (document.body.parentNode);
    if (state.summary.prefs.tweakChrome && state.summary.OS) {
      html.setAttribute("os", state.summary.OS);
    } else {
      html.removeAttribute("os");
    }
    previousOS = state.summary.OS;
    previousTweakChrome = state.summary.prefs.tweakChrome;
  }

  if (!conversationHeader) {
    conversationHeader = document.querySelector("conversation-header");
  }
  conversationHeader.setData(state.summary, state.messages.msgData);
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    // @ts-ignore
    if (BrowserSim) {
      // @ts-ignore
      globalThis.browser = await BrowserSim.getBrowserAsync();
    }

    // When moving to a WebExtension page this can simply be moved to CSS (see
    // https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Internationalization).
    document.documentElement.setAttribute(
      "dir",
      browser.i18n.getMessage("@@bidi_dir")
    );

    let store = RTK.configureStore({
      reducer: conversationApp,
    });
    gStore = store;

    // Now we have `browser` and `store` set-up, load the custom elements.
    // These are not using a loop with a constant, because WebPack
    // struggles to find them. At some stage, it would be good to move these
    // in to the html, if we can somehow avoid the `browser` issue.
    // We also have to pass the dispatch function down manually for now, as
    // we don't yet have a good solution for how to handle the dispatcher whilst
    // we are still transitioning.
    let { ConversationHeader } = await import(
      "./components/conversation/conversationHeader.mjs"
    );
    ConversationHeader.dispatch = store.dispatch;
    let { ConversationFooter } = await import(
      "./components/conversation/conversationFooter.mjs"
    );
    ConversationFooter.dispatch = store.dispatch;

    store.subscribe(handleStoreUpdate);

    // Once we can potentially load in a WebExtension scope, then we should
    // be able to remove this.
    const messageListContainer = document.getElementById("messageList");
    let root = ReactDOMClient.createRoot(messageListContainer);
    root.render(
      React.createElement(
        ReactRedux.Provider,
        // @ts-ignore
        { store },
        React.createElement(MessageList)
      )
    );

    // Kick everything off.
    store.dispatch(controllerActions.waitForStartup());

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
