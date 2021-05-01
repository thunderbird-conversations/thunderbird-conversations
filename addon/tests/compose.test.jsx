/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

import { enzyme, waitForComponentToPaint } from "./utils.js";
import React from "react";
import { jest } from "@jest/globals";
import { browser } from "../content/es-modules/thunderbird-compat.js";

// Import the components we want to test
import { Main, store } from "../compose/compose.jsx";
import {
  TextArea,
  TextBox,
} from "../content/components/compose/composeFields.jsx";
import { composeActions } from "../content/reducer/reducer-compose.js";

describe("Compose full page tests", () => {
  let mockedSend;
  let main;

  beforeEach(async () => {
    mockedSend = jest.spyOn(browser.convCompose, "send");
    main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    await store.dispatch(composeActions.initCompose());
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
    await store.dispatch(composeActions.resetStore());

    const inputs = main.find(TextBox);
    const inputBox = inputs.at(0);
    inputBox.find("input").simulate("change", { target: { value: "a" } });

    // Should have correctly set up the initial values.
    expect(store.getState().compose).toStrictEqual({
      from: "a",
      body: undefined,
      modified: true,
      subject: undefined,
      to: undefined,
      sending: false,
      sendingMsg: "",
    });
  });
});
