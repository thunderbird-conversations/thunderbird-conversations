/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { JSDOM } from "jsdom";

/**
 * @import {TextBoxRenderer,TextAreaRenderer} from "../content/components/compose/composeFields.mjs"
 */

describe("Compose components have correct return values", () => {
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
    globalThis.customElements = dom.window.customElements;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event;

    // Import for side effects
    await import("../content/components/compose/composeFields.mjs");
  });

  it("TextBox always returns a string type", async () => {
    dom.window.document.body.appendChild(
      dom.window.document.createElement("text-box")
    );
    let testComponent = /** @type {TextBoxRenderer} */ (
      dom.window.document.querySelector("text-box")
    );

    testComponent.shadowRoot.querySelector("input").value = "first text";

    assert.equal(testComponent.value, "first text");
  });

  it("TextArea always returns a string type", () => {
    dom.window.document.body.appendChild(
      dom.window.document.createElement("text-area")
    );
    let testComponent = /** @type {TextBoxRenderer} */ (
      dom.window.document.querySelector("text-area")
    );

    testComponent.shadowRoot.querySelector("textarea").value = "first text";

    assert.equal(testComponent.value, "first text");
  });
});
