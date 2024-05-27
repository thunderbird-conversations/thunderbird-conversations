/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render, screen } from "@testing-library/react";
import React from "react";

// Import the components we want to test
import { SvgIcon } from "../content/components/svgIcon.mjs";

describe("SvgIcon test", () => {
  it("renders given a full path", async () => {
    const PATH = "full/path/to/icon";
    render(React.createElement(SvgIcon, { fullPath: PATH }));

    assert.equal(
      screen.getByTestId("use").getAttribute("xlink:href"),
      `icons/${PATH}`
    );
  });

  it("renders given a hash", async () => {
    const HASH = "abc";
    render(React.createElement(SvgIcon, { hash: HASH }));

    assert.equal(
      screen.getByTestId("use").getAttribute("xlink:href"),
      "icons/material-icons.svg#" + HASH
    );
  });
});
