/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, before, beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";

describe("Compose full page tests", () => {
  let mockedSend;

  let dom;

  // Note: Re-use for all tests, as the import won't work.
  before(async () => {
    // Setup the dom and assign values to globalThis, before importing the
    // components under test, to ensure everything is loaded in the correct
    // scopes.
    dom = new JSDOM(`<!DOCTYPE html><p>Hello world</p>`, {
      // runScripts: "dangerously",
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
    await import("../content/components/compose/composeWidget.mjs");
  });

  beforeEach((t) => {
    mockedSend = t.mock.method(browser.convCompose, "send", () => {});
    t.mock.method(window, "close", () => {});
    let composeWidget = dom.window.document.createElement("compose-widget");
    composeWidget.setAttribute("from", "foo@example.com");
    composeWidget.setAttribute("identityId", "id3");
    dom.window.document.body.appendChild(composeWidget);
  });

  afterEach(() => {
    let composeWidget = dom.window.document.querySelector("compose-widget");
    dom.window.document.body.removeChild(composeWidget);
  });

  it("A message can be sent", async (t) => {
    let composeWidget = dom.window.document.querySelector("compose-widget");

    for (let inputBox of composeWidget.shadowRoot.querySelectorAll(
      "text-box"
    )) {
      const name = inputBox.className;
      if (name != "from") {
        inputBox.value = name;
      }
    }
    let textArea = composeWidget.shadowRoot.querySelector(".body");
    textArea.value = "body";

    let sendBtn = composeWidget.shadowRoot.querySelector("button.send");
    sendBtn.click();

    await t.waitFor(() => {
      if (!mockedSend.mock.calls.length) {
        throw new Error("Not got one yet");
      }
    });

    assert.deepEqual(mockedSend.mock.calls[0].arguments[0], {
      originalMsgId: undefined,
      from: "id3",
      to: "to",
      subject: "subject",
      body: "body",
    });
  });

  it("Modifying a field prevents closing the window", async () => {
    let composeWidget = dom.window.document.querySelector("compose-widget");
    let inputBox = composeWidget.shadowRoot.querySelector(".to");

    inputBox.value = "a";

    let prevented = false;
    let event = {
      preventDefault: () => {
        prevented = true;
      },
    };

    composeWidget.checkBeforeUnload(event);

    assert.ok(prevented, "Should have prevented unload");
  });
});
