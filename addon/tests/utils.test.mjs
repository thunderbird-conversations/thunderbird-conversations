/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getInitials } from "../content/esmodules/utils.mjs";

describe("Test utility functions", () => {
  it("getInitials extracts initials from names", async () => {
    assert.equal(getInitials(""), "??");
    assert.equal(getInitials("X"), "X");
    assert.equal(getInitials("Tammy Smith"), "TS");
    assert.equal(getInitials("tammy smith"), "TS");
    assert.equal(getInitials("tammy smith jackson"), "TJ");
  });
  it("getInitials handles wide characters", async () => {
    assert.equal(getInitials("明治天皇"), "明治");
    assert.equal(getInitials("😍😏😊"), "😍");
  });
  it("getInitials interprets the first part of an email address as being a name", async () => {
    assert.equal(getInitials("sam@fake.com"), "SA");
    assert.equal(getInitials("same.wise@fake.com"), "SW");
    assert.equal(getInitials("same.wise+extra@fake.com"), "SW");
  });
});
