/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Need to import utils.js to set up the fetch stub.
// eslint-disable-next-line no-unused-vars
import { enzyme } from "./utils.js";
import { jest } from "@jest/globals";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";

// Import the components we want to test
import {
  composeSlice,
  composeActions,
} from "../content/reducer/reducer-compose.js";

const composeApp = Redux.combineReducers({
  compose: composeSlice.reducer,
});

const store = RTK.configureStore({ reducer: composeApp });

describe("Compose Reducer and Actions tests", () => {
  let mockedList;
  let mockedGet;
  let mockedSend;

  beforeEach(() => {
    mockedList = jest.spyOn(browser.accounts, "list");
    mockedGet = jest.spyOn(browser.accounts, "get");
    mockedSend = jest.spyOn(browser.convCompose, "send");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("initCompose() retrieves the default identity information", async () => {
    await store.dispatch(composeActions.initCompose({ showSubject: false }));

    expect(mockedList).toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();

    // Should have correctly set up the initial values.
    expect(store.getState()).toStrictEqual({
      compose: {
        from: "id3@example.com",
        identityId: "id3",
        email: "id3@example.com",
        modified: false,
        sending: false,
        sendingMsg: "",
        showSubject: false,
        subject: undefined,
        to: undefined,
      },
    });
  });

  test("initCompose() resets the store", async () => {
    await store.dispatch(composeActions.setValue("subject", "test"));

    await store.dispatch(composeActions.initCompose({ showSubject: true }));

    expect(store.getState()).toStrictEqual({
      compose: {
        from: "id3@example.com",
        identityId: "id3",
        email: "id3@example.com",
        modified: false,
        sending: false,
        sendingMsg: "",
        showSubject: true,
        subject: undefined,
        to: undefined,
      },
    });
  });

  test("setValue() sets a value in the store", async () => {
    await store.dispatch(composeActions.setValue("_custom", "test"));

    expect(store.getState().compose).toHaveProperty("_custom", "test");
  });

  test("sendMessage() sends a message", async () => {
    await store.dispatch(composeActions.setValue("to", "me@example.com"));
    await store.dispatch(composeActions.setValue("subject", "Test"));
    await store.dispatch(composeActions.setValue("body", "Hello"));
    await store.dispatch(composeActions.sendMessage("custom"));

    expect(mockedSend).toHaveBeenCalledWith({
      from: "id3",
      to: "me@example.com",
      subject: "Test",
      body: "Hello",
    });
  });
});
