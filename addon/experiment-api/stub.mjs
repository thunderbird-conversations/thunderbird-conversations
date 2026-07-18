/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global BrowserSim */
// eslint-disable-next-line import-x/no-unassigned-import
import "../content/components/svgIcon.mjs";
import React from "react";
import ReactDOMClient from "react-dom/client";
import * as ReactRedux from "react-redux";
import { MessageList } from "../content/components/message/messageList.mjs";
import { controllerActions } from "../content/reducer/controllerActions.mjs";
import { summarySlice } from "../content/reducer/reducerSummary.mjs";
import { storeUtils } from "../content/reducer/storeUtils.mjs";
/**
 * @import {ConversationHeader} from "./components/conversation/conversationHeader.mjs"
 */

function handlePrefUpdate(value) {
  storeUtils.store.dispatch(
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
  let state = storeUtils.store.getState();

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

    // Now we have `browser` and `store` set-up, load the custom elements.
    // These are not using a loop with a constant, because WebPack
    // struggles to find them. At some stage, it would be good to move these
    // in to the html, if we can somehow avoid the `browser` issue.
    // We also have to pass the dispatch function down manually for now, as
    // we don't yet have a good solution for how to handle the dispatcher whilst
    // we are still transitioning.
    let { ConversationHeader } =
      await import("../content/components/conversation/conversationHeader.mjs");
    ConversationHeader.dispatch = storeUtils.store.dispatch;
    let { ConversationFooter } =
      await import("../content/components/conversation/conversationFooter.mjs");
    ConversationFooter.dispatch = storeUtils.store.dispatch;
    let { ContactDetail } =
      await import("../content/components/contactDetail.mjs");
    ContactDetail.dispatch = storeUtils.store.dispatch;
    await import("../content/components/message/messageActionButton.mjs");
    await import("../content/components/message/messageFooter.mjs");
    await import("../content/components/compose/composeFields.mjs");
    await import("../content/components/compose/composeWidget.mjs");

    storeUtils.store.subscribe(handleStoreUpdate);

    // Once we can potentially load in a WebExtension scope, then we should
    // be able to remove this.
    const messageListContainer = document.getElementById("messageList");
    let root = ReactDOMClient.createRoot(messageListContainer);
    root.render(
      React.createElement(
        ReactRedux.Provider,
        { store: storeUtils.store },
        React.createElement(MessageList)
      )
    );

    // Kick everything off.
    storeUtils.store.dispatch(controllerActions.waitForStartup());

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
