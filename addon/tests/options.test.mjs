/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
// eslint-disable-next-line no-shadow
import { render, fireEvent, act, screen } from "@testing-library/react";
import React from "react";
import { i18n } from "../content/esmodules/thunderbirdCompat.mjs";
import { assertContains } from "./utils.mjs";

// Import the components we want to test
import {
  BinaryOption,
  NumericOption,
  TextOption,
  ChoiceOption,
  Main,
  store,
  actions,
} from "../options/options.mjs";

describe("Option components have correct return values", () => {
  it("NumericOption always returns a numeric type", (t) => {
    const callback = t.mock.fn();
    render(
      React.createElement(NumericOption, {
        onChange: callback,
        name: "option_name",
        value: 7,
      })
    );
    // Put in a number and expect it back
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "45" },
    });

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], 45);
    assert.equal(typeof callback.mock.calls[0].arguments[1], "number");

    // Put in a non-number and expect it to still return a number
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "abc" },
    });

    assert.equal(typeof callback.mock.calls[1].arguments[1], "number");
  });

  it("BinaryOption always returns a boolean type", (t) => {
    const callback = t.mock.fn();
    let { rerender } = render(
      React.createElement(BinaryOption, {
        onChange: callback,
        name: "option_name",
        value: true,
      })
    );
    assert.equal(screen.getByRole("checkbox").checked, true);

    fireEvent.click(screen.getByRole("checkbox"));

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], false);
    assert.equal(typeof callback.mock.calls[0].arguments[1], "boolean");

    rerender(
      React.createElement(BinaryOption, {
        onChange: callback,
        name: "option_name",
        value: false,
      })
    );

    fireEvent.click(screen.getByRole("checkbox"));

    assert.equal(callback.mock.calls[1].arguments[1], true);
  });

  it("TextOption always returns a string type", (t) => {
    const callback = t.mock.fn();
    render(
      React.createElement(TextOption, {
        onChange: callback,
        name: "option_name",
        value: "first text",
      })
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "my special text" },
    });

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], "my special text");
    assert.equal(typeof callback.mock.calls[0].arguments[1], "string");
  });

  it("ChoiceOption always returns the value supplied", (t) => {
    const callback = t.mock.fn();
    let { rerender } = render(
      React.createElement(ChoiceOption, {
        onChange: callback,
        name: "option_name",
        choices: [
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: "abc" },
        ],
        value: 10,
      })
    );
    // We have three choices, so there are three input radio buttons
    // fireEvent.change(screen.getByRole("radio", { name: "item1" }), { target: { checked: true }});
    fireEvent.click(screen.getByRole("radio", { name: "item1" }));
    assert.equal(callback.mock.calls.length, 1);
    rerender(
      React.createElement(ChoiceOption, {
        onChange: callback,
        name: "option_name",
        choices: [
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: "abc" },
        ],
        value: 5,
      })
    );
    fireEvent.click(screen.getByRole("radio", { name: "item2" }));
    assert.equal(callback.mock.calls.length, 2);
    fireEvent.click(screen.getByRole("radio", { name: "item3" }));
    assert.equal(callback.mock.calls.length, 3);

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], 5);
    assert.equal(callback.mock.calls[1].arguments[1], 10);
    assert.equal(callback.mock.calls[2].arguments[1], "abc");
  });
});

describe("Option Reducer and Actions tests", () => {
  let mockedGet;
  let mockedSet;
  beforeEach((t) => {
    mockedGet = t.mock.method(browser.storage.local, "get");
    mockedSet = t.mock.method(browser.storage.local, "set");
  });

  it("initPrefs() retrieves preferences from `browser.storage.local`", async () => {
    await store.dispatch(actions.initPrefs());
    // When we initialize preferences, there should be one call to "get"
    assert.equal(mockedGet.mock.calls.length, 1);
    // That call should have requested the "preferences" object
    assert.equal(
      mockedGet.mock.calls[mockedGet.mock.calls.length - 1].arguments[0],
      "preferences"
    );
  });

  it("savePref() sets a pref in `browser.storage.local`", async () => {
    await store.dispatch(actions.savePref("_custom_pref", 100));
    // That call should have set a property on the "preferences" object
    assert.deepEqual(
      mockedSet.mock.calls[mockedSet.mock.calls.length - 1].arguments[0],
      {
        preferences: { _custom_pref: 100 },
      }
    );
  });
});

describe("Option full page tests", () => {
  let mockedSet;
  beforeEach((t) => {
    mockedSet = t.mock.method(browser.storage.local, "set");
  });

  it("Toggling an option changes the setting in browser.storage.local", async () => {
    await act(async () => {
      render(React.createElement(Main));
      await i18n.isLoaded;
    });

    // We are going to click on the option and we expect that it's new value
    // is saved via `browser.storage.local.set`
    await act(async () => {
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Hide Signatures" })
      );
    });
    const beforeChange = mockedSet.mock.calls.pop();
    assertContains(beforeChange.arguments[0], {
      preferences: { hide_sigs: true },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Hide Signatures" })
      );
    });
    const afterChange = mockedSet.mock.calls.pop();
    assertContains(afterChange.arguments[0], {
      preferences: { hide_sigs: false },
    });
  });

  it("Pressing the button opens the setup assistant", async (t) => {
    const mockedTabCreate = t.mock.method(browser.tabs, "create");
    await act(async () => {
      render(React.createElement(Main));
      await i18n.isLoaded;
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start the setup assistant" })
    );

    assert.equal(mockedTabCreate.mock.calls.length, 1);
    assert.deepEqual(mockedTabCreate.mock.calls[0].arguments[0], {
      url: "../assistant/assistant.html",
    });
  });

  it("Pressing the undo button runs the undo", async (t) => {
    const spy = t.mock.fn();
    t.mock.method(browser.runtime, "connect").mock.mockImplementation(() => {
      return {
        postMessage: spy,
      };
    });

    await act(async () => {
      render(React.createElement(Main));
      await i18n.isLoaded;
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Undo Customizations" })
    );

    assert.equal(spy.mock.calls.length, 1);
  });
});
