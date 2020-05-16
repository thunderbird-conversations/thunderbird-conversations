/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests

// From https://gist.github.com/olmokramer/82ccce673f86db7cda5e
function isValidColor(color) {
  if (color.charAt(0) === "#") {
    color = color.substring(1);
    return (
      [3, 4, 6, 8].indexOf(color.length) > -1 && !isNaN(parseInt(color, 16))
    );
  }
  return /^(rgb|hsl)a?\((\d+%?(deg|rad|grad|turn)?[,\s]+){2,3}[\s\/]*[\d\.]+%?\)$/i.test(
    color
  );
}

// Import the functions we want to test
const { getInitials, freshColor } = require("../content/utils.js");

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
  test("freshColor turns an email into a valid hsl color", async () => {
    // Outputs a valid css color
    expect(isValidColor(freshColor("abc@fake.com"))).toBe(true);
    // Outputs the same color for the same email
    expect(freshColor("abc@fake.com")).toBe(freshColor("abc@fake.com"));
    // Outputs different colors for different emails
    expect(freshColor("abc@fake.com")).not.toBe(freshColor("cbc@fake.com"));
  });
});
