/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";
import { assertContains } from "./utils.mjs";

// Import the components we want to test
import {
  composeSlice,
  composeActions,
} from "../content/reducer/reducerCompose.mjs";

const composeApp = Redux.combineReducers({
  compose: composeSlice.reducer,
});

const store = RTK.configureStore({ reducer: composeApp });

describe("Compose Reducer and Actions tests", () => {
  let mockedAccountDefault;
  let mockedGet;
  let mockedSend;

  beforeEach((t) => {
    mockedAccountDefault = t.mock.method(browser.accounts, "getDefault");
    mockedGet = t.mock.method(browser.identities, "getDefault");
    mockedSend = t.mock.method(browser.convCompose, "send");
  });

  it("initCompose() retrieves the default identity information", async () => {
    await store.dispatch(composeActions.initCompose({ showSubject: false }));

    assert.equal(mockedAccountDefault.mock.calls.length, 1);
    assert.equal(mockedGet.mock.calls.length, 1);

    // Should have correctly set up the initial values.
    assert.deepEqual(store.getState(), {
      compose: {
        body: undefined,
        from: "id3@EXAMPLE.com",
        identityId: "id3",
        inReplyTo: undefined,
        email: "id3@EXAMPLE.com",
        modified: false,
        replyOnTop: null,
        sending: false,
        sendingMsg: "",
        showSubject: false,
        subject: undefined,
        to: undefined,
      },
    });
  });

  it("initCompose() resets the store", async () => {
    await store.dispatch(composeActions.setValue("subject", "test"));

    await store.dispatch(composeActions.initCompose({ showSubject: true }));

    assert.deepEqual(store.getState(), {
      compose: {
        body: undefined,
        from: "id3@EXAMPLE.com",
        identityId: "id3",
        inReplyTo: undefined,
        email: "id3@EXAMPLE.com",
        modified: false,
        replyOnTop: null,
        sending: false,
        sendingMsg: "",
        showSubject: true,
        subject: undefined,
        to: undefined,
      },
    });
  });

  it("setValue() sets a value in the store", async () => {
    await store.dispatch(composeActions.setValue("_custom", "test"));

    assert.equal(store.getState().compose._custom, "test");
  });

  it("sendMessage() sends a message", async () => {
    await store.dispatch(composeActions.setValue("to", "me@example.com"));
    await store.dispatch(composeActions.setValue("subject", "Test"));
    await store.dispatch(composeActions.setValue("body", "Hello"));
    await store.dispatch(composeActions.sendMessage("custom"));

    assertContains(mockedSend.mock.calls[0].arguments[0], {
      from: "id3",
      to: "me@example.com",
      subject: "Test",
      body: "Hello",
    });
  });
});
