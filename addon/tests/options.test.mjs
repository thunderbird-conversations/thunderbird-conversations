/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { JSDOM } from "jsdom";

/**
 * @import {BinaryOption, ChoiceOption, NumericOption} from "../options/options.mjs"
 */

describe("Option components have correct return values", () => {
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
    await import("../options/options.mjs");
  });

  it("NumericOption always returns a numeric type", (t) => {
    let testComponent = /** @type {NumericOption} */ (
      dom.window.document.createElement("numeric-option")
    );
    dom.window.document.body.appendChild(testComponent);

    testComponent.savePref = t.mock.fn(() => Promise.resolve());
    testComponent.setProps(
      {
        name: "option_name",
        desc: "option_desc",
        title: "option",
      },
      7
    );

    let input = testComponent.shadowRoot.querySelector("input");
    assert.equal(input.value, "7", "Should have correct value");

    input.value = "45";
    input.dispatchEvent(new dom.window.Event("change"));

    assert.equal(
      testComponent.savePref.mock.calls.length,
      1,
      "Should have called savePref once"
    );
    assert.equal(
      testComponent.savePref.mock.calls[0].arguments[0],
      "option_name"
    );
    assert.equal(testComponent.savePref.mock.calls[0].arguments[1], 45);
    assert.equal(
      typeof testComponent.savePref.mock.calls[0].arguments[1],
      "number"
    );

    // Put in a non-number and expect it to still return a number
    input.value = "abc";
    input.dispatchEvent(new dom.window.Event("change"));

    assert.equal(
      typeof testComponent.savePref.mock.calls[1].arguments[1],
      "number"
    );
  });

  it("BinaryOption always returns a boolean type", async (t) => {
    let testComponent = /** @type {BinaryOption} */ (
      dom.window.document.createElement("binary-option")
    );
    dom.window.document.body.appendChild(testComponent);

    testComponent.savePref = t.mock.fn(() => Promise.resolve());
    testComponent.setProps(
      {
        name: "option_name",
        desc: "option_desc",
        title: "option",
      },
      true
    );

    let input = testComponent.shadowRoot.querySelector("input");
    assert.equal(input.checked, true, "Should be checked initially");

    input.click();

    assert.equal(
      testComponent.savePref.mock.calls.length,
      1,
      "Should have called savePref once"
    );
    assert.equal(
      testComponent.savePref.mock.calls[0].arguments[0],
      "option_name"
    );
    assert.equal(testComponent.savePref.mock.calls[0].arguments[1], false);
    assert.equal(
      typeof testComponent.savePref.mock.calls[0].arguments[1],
      "boolean"
    );
  });

  it("ChoiceOption always returns the value supplied", (t) => {
    let testComponent = /** @type {ChoiceOption} */ (
      dom.window.document.createElement("choice-option")
    );
    dom.window.document.body.appendChild(testComponent);

    testComponent.savePref = t.mock.fn(() => Promise.resolve());
    testComponent.setProps(
      {
        name: "option_name",
        desc: "option_desc",
        title: "option",
        choices: [
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: 15 },
        ],
      },
      10
    );

    let inputs = testComponent.shadowRoot.querySelectorAll(
      "input[name='option_name']"
    );

    for (let input of inputs) {
      if (input.value == "10") {
        assert.ok(input.checked, "Should have checked the correct item");
      } else {
        assert.ok(!input.checked, "Should not have checked the incorrect item");
      }
    }

    inputs[0].click();

    assert.equal(
      testComponent.savePref.mock.calls.length,
      1,
      "Should have called savePref once"
    );
    assert.equal(
      testComponent.savePref.mock.calls[0].arguments[0],
      "option_name"
    );
    assert.equal(testComponent.savePref.mock.calls[0].arguments[1], 5);
    assert.equal(
      typeof testComponent.savePref.mock.calls[0].arguments[1],
      "number"
    );

    inputs[1].click();
    assert.equal(testComponent.savePref.mock.calls[1].arguments[1], 10);

    inputs[2].click();
    assert.equal(testComponent.savePref.mock.calls[2].arguments[1], 15);
  });
});
