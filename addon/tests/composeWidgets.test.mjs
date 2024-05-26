/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
// eslint-disable-next-line no-shadow
import { render, fireEvent, screen } from "@testing-library/react";
import React from "react";

// Import the components we want to test
import {
  TextArea,
  TextBox,
} from "../content/components/compose/composeFields.mjs";

describe("Compose components have correct return values", () => {
  it("TextBox always returns a string type", () => {
    const callback = mock.fn();
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

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], "my special text");
    assert.equal(typeof callback.mock.calls[0].arguments[1], "string");
  });

  it("TextArea always returns a string type", () => {
    const callback = mock.fn();
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

    assert.equal(callback.mock.calls[0].arguments[0], "option_name");
    assert.equal(callback.mock.calls[0].arguments[1], "my special text");
    assert.equal(typeof callback.mock.calls[0].arguments[1], "string");
  });
});
