/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

import { enzyme } from "./utils.js";
import React from "react";
import { jest } from "@jest/globals";

// Import the components we want to test
import {
  TextArea,
  TextBox,
} from "../content/components/compose/composeFields.jsx";

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
