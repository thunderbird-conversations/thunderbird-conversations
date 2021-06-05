/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Standard imports for all tests
import { enzyme, waitForComponentToPaint } from "./utils.js";
import React from "react";
import { jest } from "@jest/globals";
import { browser } from "../content/es-modules/thunderbird-compat.js";

// Import the components we want to test
import {
  BinaryOption,
  NumericOption,
  TextOption,
  ChoiceOption,
  Main,
  store,
  actions,
} from "../options/options.jsx";

describe("Option components have correct return values", () => {
  test("NumericOption always returns a numeric type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <NumericOption onChange={callback} name="option_name" value={7} />
    );
    // Put in a number and expect it back
    option.find("input").simulate("change", { target: { value: "45" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(45);
    expect(typeof callback.mock.calls[0][1]).toBe("number");

    // Put in a non-number and expect it to still return a number
    option.find("input").simulate("change", { target: { value: "abc" } });

    expect(typeof callback.mock.calls[1][1]).toBe("number");
  });

  test("BinaryOption always returns a boolean type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <BinaryOption onChange={callback} name="option_name" value={true} />
    );
    option.find("input").simulate("change", { target: { checked: true } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(true);
    expect(typeof callback.mock.calls[0][1]).toBe("boolean");

    option.find("input").simulate("change", { target: { checked: false } });

    expect(callback.mock.calls[1][1]).toBe(false);
  });

  test("TextOption always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextOption onChange={callback} name="option_name" value={"first text"} />
    );
    option
      .find("input")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("ChoiceOption always returns the value supplied", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <ChoiceOption
        onChange={callback}
        name="option_name"
        choices={[
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: "abc" },
        ]}
        value={5}
      />
    );
    // We have three choices, so there are three input radio buttons
    const options = option.find("input");
    options.at(0).simulate("change", { target: { checked: true } });
    options.at(1).simulate("change", { target: { checked: true } });
    options.at(2).simulate("change", { target: { checked: true } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(5);
    expect(callback.mock.calls[1][1]).toBe(10);
    expect(callback.mock.calls[2][1]).toBe("abc");
  });
});

describe("Option Reducer and Actions tests", () => {
  const mockedGet = jest.spyOn(browser.storage.local, "get");
  const mockedSet = jest.spyOn(browser.storage.local, "set");

  test("initPrefs() retrieves preferences from `browser.storage.local`", async () => {
    await store.dispatch(actions.initPrefs());
    // When we initialize preferences, there should be one call to "get"
    expect(mockedGet).toHaveBeenCalled();
    // That call should have requested the "preferences" object
    expect(mockedGet.mock.calls[mockedGet.mock.calls.length - 1][0]).toBe(
      "preferences"
    );
  });

  test("savePref() sets a pref in `browser.storage.local`", async () => {
    await store.dispatch(actions.savePref("_custom_pref", 100));
    // That call should have set a property on the "preferences" object
    expect(
      mockedSet.mock.calls[mockedSet.mock.calls.length - 1][0]
    ).toMatchObject({ preferences: { _custom_pref: 100 } });
  });
});

describe("Option full page tests", () => {
  const mockedSet = jest.spyOn(browser.storage.local, "set");

  test("Toggling an option changes the setting in browser.storage.local", async () => {
    const main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    const option = main.find(BinaryOption).at(0);
    const input = option.find("input");
    const name = option.props().name;

    // We are going to click on the option and we expect that it's new value
    // is saved via `browser.storage.local.set`
    input.simulate("change", { target: { checked: false } });
    const beforeChange = mockedSet.mock.calls.pop();
    expect(beforeChange[0]).toMatchObject({ preferences: { [name]: false } });

    input.simulate("change", { target: { checked: true } });
    const afterChange = mockedSet.mock.calls.pop();
    expect(afterChange[0]).toMatchObject({ preferences: { [name]: true } });
  });

  test("Pressing the button opens the setup assistant", async () => {
    const mockedTabCreate = jest.spyOn(browser.tabs, "create");
    const main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    const button = main.find(".start");

    button.simulate("click");

    expect(mockedTabCreate).toHaveBeenCalled();
    expect(mockedTabCreate.mock.calls[0][0]).toStrictEqual({
      url: "../assistant/assistant.html",
    });
  });

  test("Pressing the undo button runs the undo", async () => {
    const mockedUndo = jest.spyOn(browser.conversations, "undoCustomizations");
    window.alert = jest.fn();
    const main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    const button = main.find(".undo");

    button.simulate("click");

    expect(mockedUndo).toHaveBeenCalled();
  });
});
