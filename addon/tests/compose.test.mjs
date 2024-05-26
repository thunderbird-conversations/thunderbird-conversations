/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  render,
  fireEvent,
  act,
  waitFor,
  // eslint-disable-next-line no-shadow
  screen,
} from "@testing-library/react";
import React from "react";

// Import the components we want to test
import { Main, store } from "../compose/compose.mjs";
import { composeActions } from "../content/reducer/reducerCompose.mjs";

describe("Compose full page tests", () => {
  let mockedSend;

  beforeEach(async (t) => {
    mockedSend = t.mock.method(browser.convCompose, "send");
    render(React.createElement(Main));

    await act(async () => {
      await store.dispatch(composeActions.initCompose({ showSubject: true }));
    });
  });

  it("A message can be sent", async () => {
    const inputs = screen.getAllByRole("textbox");

    for (let inputBox of inputs) {
      const name = inputBox.id;
      if (name != "from") {
        fireEvent.change(inputBox, {
          target: { value: name },
        });
      }
    }

    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      if (!mockedSend.mock.calls.length) {
        throw new Error("Not got one yet");
      }
    });

    assert.deepEqual(mockedSend.mock.calls[0].arguments[0], {
      originalMsgId: undefined,
      from: "id3",
      to: "to",
      subject: "subject",
      body: "body",
    });
  });

  it("Modifying a field sets the modified flag", async () => {
    await act(async () => {
      await store.dispatch(composeActions.resetStore());
    });

    const inputBox = screen.getByRole("textbox", { name: /to/i });
    fireEvent.change(inputBox, {
      target: { value: "a" },
    });

    await waitFor(() => {
      if (!store.getState().compose.modified) {
        throw new Error("Not ready yet");
      }
    });

    // Should have correctly set up the initial values.
    assert.deepEqual(store.getState().compose, {
      from: undefined,
      body: undefined,
      modified: true,
      replyOnTop: null,
      subject: undefined,
      to: "a",
      sending: false,
      sendingMsg: "",
      showSubject: false,
    });
  });
});
