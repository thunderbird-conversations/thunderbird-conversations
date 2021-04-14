/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

import { enzyme, waitForComponentToPaint } from "./utils.js";
import React from "react";
import { jest } from "@jest/globals";
import { browser } from "../content/es-modules/thunderbird-compat.js";

// Import the components we want to test
import { Main, store, actions } from "../compose/ComposeWidget.jsx";
import { TextArea, TextBox } from "../compose/composeFields.jsx";

describe("Compose components have correct return values", () => {
  test("TextBox always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextBox
        disabled={false}
        onChange={callback}
        name="option_name"
        value={"first text"}
      />
    );
    option
      .find("input")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("TextArea always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextArea onChange={callback} name="option_name" value={"first text"} />
    );
    option
      .find("textarea")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });
});

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
    await store.dispatch(actions.initCompose());

    expect(mockedList).toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();

    // Should have correctly set up the initial values.
    expect(store.getState()).toStrictEqual({
      from: "id3@example.com",
      identityId: "id3",
      email: "id3@example.com",
      modified: false,
      os: "win",
      sending: false,
      sendingMsg: "",
    });
  });

  test("setValue() sets a value in the store", async () => {
    await store.dispatch(actions.setValue("_custom", "test"));

    expect(store.getState()).toHaveProperty("_custom", "test");
  });

  test("sendMessage() sends a message", async () => {
    await store.dispatch(actions.setValue("to", "me@example.com"));
    await store.dispatch(actions.setValue("subject", "Test"));
    await store.dispatch(actions.setValue("body", "Hello"));
    await store.dispatch(actions.sendMessage("custom"));

    expect(mockedSend).toHaveBeenCalledWith({
      from: "id3",
      to: "me@example.com",
      subject: "Test",
      body: "Hello",
    });
  });
});

describe("Compose full page tests", () => {
  let mockedSend;
  let main;

  beforeEach(() => {
    mockedSend = jest.spyOn(browser.convCompose, "send");
    main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("A message can be sent", async () => {
    const inputs = main.find(TextBox);
    for (let i = 0; i < inputs.length; i++) {
      const inputBox = inputs.at(i);
      const name = inputBox.props().name;
      if (name != "from") {
        inputBox.find("input").simulate("change", { target: { value: name } });
      }
    }

    const textArea = main.find(TextArea).at(0);
    textArea
      .find("textarea")
      .simulate("change", { target: { value: "testArea" } });

    const sendButton = main.find("button");
    sendButton.simulate("click");

    await new Promise((resolve) => {
      let maxTimes = 10;
      function tryIt() {
        if (mockedSend.mock.calls.length) {
          resolve();
          return;
        }
        maxTimes--;
        if (!maxTimes) {
          resolve();
        }
        setTimeout(tryIt, 50);
      }
      setTimeout(tryIt, 50);
    });

    expect(mockedSend).toHaveBeenCalledWith({
      from: "id3",
      to: "to",
      subject: "subject",
      body: "testArea",
    });
  });

  test("Modifying a field sets the modififed flag", async () => {
    await store.dispatch(actions.resetStore());

    const inputs = main.find(TextBox);
    const inputBox = inputs.at(0);
    inputBox.find("input").simulate("change", { target: { value: "a" } });

    // Should have correctly set up the initial values.
    expect(store.getState()).toStrictEqual({
      from: "a",
      body: undefined,
      modified: true,
      subject: undefined,
      to: undefined,
      os: "win",
      sending: false,
      sendingMsg: "",
    });
  });
});
