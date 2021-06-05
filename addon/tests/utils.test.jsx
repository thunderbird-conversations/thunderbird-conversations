/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getInitials } from "../content/es-modules/utils.js";

describe("Test utility functions", () => {
  test("getInitials extracts initials from names", async () => {
    expect(getInitials("")).toBe("??");
    expect(getInitials("X")).toBe("X");
    expect(getInitials("Tammy Smith")).toBe("TS");
    expect(getInitials("tammy smith")).toEqual("TS");
    expect(getInitials("tammy smith jackson")).toEqual("TJ");
  });
  test("getInitials handles wide characters", async () => {
    expect(getInitials("明治天皇")).toBe("明治");
    expect(getInitials("😍😏😊")).toEqual("😍");
  });
  test("getInitials interprets the first part of an email address as being a name", async () => {
    expect(getInitials("sam@fake.com")).toBe("SA");
    expect(getInitials("same.wise@fake.com")).toEqual("SW");
    expect(getInitials("same.wise+extra@fake.com")).toEqual("SW");
  });
});
