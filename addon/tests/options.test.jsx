/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent, act, screen } from "@testing-library/react";
import React from "react";
import { jest } from "@jest/globals";
import { i18n } from "../content/esmodules/thunderbirdCompat.js";

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
    render(<NumericOption onChange={callback} name="option_name" value={7} />);
    // Put in a number and expect it back
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "45" },
    });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(45);
    expect(typeof callback.mock.calls[0][1]).toBe("number");

    // Put in a non-number and expect it to still return a number
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "abc" },
    });

    expect(typeof callback.mock.calls[1][1]).toBe("number");
  });

  test("BinaryOption always returns a boolean type", () => {
    const callback = jest.fn();
    let { rerender } = render(
      <BinaryOption onChange={callback} name="option_name" value={true} />
    );
    expect(screen.getByRole("checkbox").checked).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(false);
    expect(typeof callback.mock.calls[0][1]).toBe("boolean");

    rerender(
      <BinaryOption onChange={callback} name="option_name" value={false} />
    );

    fireEvent.click(screen.getByRole("checkbox"));

    expect(callback.mock.calls[1][1]).toBe(true);
  });

  test("TextOption always returns a string type", () => {
    const callback = jest.fn();
    render(
      <TextOption onChange={callback} name="option_name" value={"first text"} />
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "my special text" },
    });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("ChoiceOption always returns the value supplied", () => {
    const callback = jest.fn();
    let { rerender } = render(
      <ChoiceOption
        onChange={callback}
        name="option_name"
        choices={[
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: "abc" },
        ]}
        value={10}
      />
    );
    // We have three choices, so there are three input radio buttons
    // fireEvent.change(screen.getByRole("radio", { name: "item1" }), { target: { checked: true }});
    fireEvent.click(screen.getByRole("radio", { name: "item1" }));
    expect(callback.mock.calls.length).toBe(1);
    rerender(
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
    fireEvent.click(screen.getByRole("radio", { name: "item2" }));
    expect(callback.mock.calls.length).toBe(2);
    fireEvent.click(screen.getByRole("radio", { name: "item3" }));
    expect(callback.mock.calls.length).toBe(3);

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
    await act(async () => {
      render(<Main />);
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
    expect(beforeChange[0]).toMatchObject({
      preferences: { hide_sigs: true },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("checkbox", { name: "Hide Signatures" })
      );
    });
    const afterChange = mockedSet.mock.calls.pop();
    expect(afterChange[0]).toMatchObject({ preferences: { hide_sigs: false } });
  });

  test("Pressing the button opens the setup assistant", async () => {
    const mockedTabCreate = jest.spyOn(browser.tabs, "create");
    await act(async () => {
      render(<Main />);
      await i18n.isLoaded;
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Start the setup assistant" })
    );

    expect(mockedTabCreate).toHaveBeenCalled();
    expect(mockedTabCreate.mock.calls[0][0]).toStrictEqual({
      url: "../assistant/assistant.html",
    });
  });

  test("Pressing the undo button runs the undo", async () => {
    const spy = jest.fn();
    jest.spyOn(browser.runtime, "connect").mockImplementation(() => {
      return {
        postMessage: spy,
      };
    });

    await act(async () => {
      render(<Main />);
      await i18n.isLoaded;
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Undo Customizations" })
    );

    expect(spy).toHaveBeenCalled();
  });
});
