/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { JSDOM } from "jsdom";

/**
 * @import {SvgIcon} from "../content/components/svgIcon.mjs"
 */

describe("SvgIcon test", () => {
  let dom;

  // Note: Re-use for all tests, as the import won't work.
  before(async () => {
    // Setup the dom and assign values to globalThis, before importing the
    // components under test, to ensure everything is loaded in the correct
    // scopes.
    dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
    });

    // We should be loading the script as a module, as per
    // https://github.com/jsdom/jsdom/wiki/Don't-stuff-jsdom-globals-onto-the-Node-global
    // However, as there's no ES module support yet, it won't work.
    // https://github.com/jsdom/jsdom/issues/2475
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.customElements = window.customElements;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.Event = window.Event;

    // Import for side effects
    await import("../content/components/svgIcon.mjs");
  });

  it("renders given a full path", async () => {
    const PATH = "full/path/to/icon";
    let testComponent = /** @type {SvgIcon} */ (
      dom.window.document.createElement("svg-icon")
    );
    testComponent.setAttribute("fullpath", PATH);

    assert.equal(
      testComponent.shadowRoot
        .querySelector("use")
        .getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      `icons/${PATH}`
    );
  });

  it("renders given a hash", async () => {
    const HASH = "abc";
    let testComponent = /** @type {SvgIcon} */ (
      dom.window.document.createElement("svg-icon")
    );
    testComponent.setAttribute("hash", HASH);

    assert.equal(
      testComponent.shadowRoot
        .querySelector("use")
        .getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      "icons/material-icons.svg#" + HASH
    );
  });
});
