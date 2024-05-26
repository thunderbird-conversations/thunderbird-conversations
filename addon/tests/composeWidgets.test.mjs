/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { jest } from "@jest/globals";

// Import the components we want to test
import {
  TextArea,
  TextBox,
} from "../content/components/compose/composeFields.mjs";

describe("Compose components have correct return values", () => {
  test("TextBox always returns a string type", () => {
    const callback = jest.fn();
    render(
      React.createElement(TextBox, {
        title: "foo",
        disabled: false,
        onChange: callback,
        name: "option_name",
        value: "first text",
      })
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "my special text" },
    });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("TextArea always returns a string type", () => {
    const callback = jest.fn();
    render(
      React.createElement(TextArea, {
        onChange: callback,
        name: "option_name",
        value: "first text",
      })
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "my special text" },
    });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });
});
