/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

import { freshColor } from "../background/contact-manager.js";

describe("Test utility functions", () => {
  test("freshColor turns an email into a valid hsl color", async () => {
    // Outputs a valid css color
    expect(isValidColor(freshColor("abc@fake.com"))).toBe(true);
    // Outputs the same color for the same email
    expect(freshColor("abc@fake.com")).toBe(freshColor("abc@fake.com"));
    // Outputs different colors for different emails
    expect(freshColor("abc@fake.com")).not.toBe(freshColor("cbc@fake.com"));
  });
});
