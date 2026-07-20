/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, before, afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { messageUtils } from "../content/reducer/messageUtils.mjs";

/**
 * @import {MessageTag, MessageTags, SpecialMessageTags} from "../content/components/message/messageTags.mjs"
 */

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
  globalThis.CustomElementRegistry = dom.window.CustomElementRegistry;
  globalThis.HTMLUListElement = dom.window.HTMLUListElement;
  globalThis.HTMLLIElement = dom.window.HTMLLIElement;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;

  // Import for side effects
  await import("../content/components/message/messageTags.mjs");
});

describe("SpecialMessageTags test", () => {
  afterEach(() => {
    let testComponent = /** @type {MessageTags} */ (
      dom.window.document.querySelector("ul")
    );
    testComponent.remove();
  });

  it("special-tag classes are applied", async (t) => {
    const tagData = [
      {
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
    ];

    let element = dom.window.document.createElement("ul", {
      is: "special-message-tags",
    });
    element.setAttribute("specialtags", JSON.stringify(tagData));
    dom.window.document.body.appendChild(element);

    let testComponent = /** @type {SpecialMessageTags} */ (
      dom.window.document.querySelectorAll("li")
    );
    assert.equal(testComponent[0].className, "success special-tag");
  });

  it("should have can-click class when details are supplied", async (t) => {
    const tagData = [
      {
        classNames: "failed",
        icon: "material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
        details: {
          type: "foo",
          detail: "message",
        },
      },
    ];

    let element = dom.window.document.createElement("ul", {
      is: "special-message-tags",
    });
    element.setAttribute("specialtags", JSON.stringify(tagData));
    dom.window.document.body.appendChild(element);

    let testComponent = /** @type {SpecialMessageTags} */ (
      dom.window.document.querySelectorAll("li")
    );
    assert.equal(testComponent[0].className, "failed special-tag can-click");
  });

  it("Clicking of special-tags", async (t) => {
    const tagData = [
      {
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "Can't click",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
      {
        details: {
          type: "enigmail",
          detail: "message",
        },
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "Can click",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
    ];
    messageUtils.store = {
      getState() {
        return { summary: { tabId: 1 } };
      },
    };

    let element = dom.window.document.createElement("ul", {
      is: "special-message-tags",
    });
    element.setAttribute("specialtags", JSON.stringify(tagData));
    dom.window.document.body.appendChild(element);

    let enigmailMock = t.mock.method(browser.convOpenPgp, "handleTagClick");

    let tags = dom.window.document.querySelectorAll("li");

    tags[0].click();
    assert.equal(enigmailMock.mock.calls.length, 0);

    // The second tag can be clicked
    tags[1].click();
    await t.waitFor(() => {
      if (!enigmailMock.mock.callCount) {
        throw new Error("Not got one yet");
      }
    });
    assert.equal(enigmailMock.mock.calls.length, 1);
  });
});

describe("MessageTags test", () => {
  const SAMPLE_TAGS = [
    {
      color: "#3333FF",
      key: "$label4",
      name: "To Do",
    },
    {
      color: "#993399",
      key: "$label5",
      name: "Later",
    },
    {
      color: "#993399",
      key: "$label1",
      name: "Important",
    },
  ];

  afterEach(() => {
    let testComponent = /** @type {MessageTags} */ (
      dom.window.document.querySelector("ul")
    );
    testComponent.remove();
  });

  it("Basic tags", async (t) => {
    let element = dom.window.document.createElement("ul", {
      is: "message-tags",
    });
    element.setAttribute("tags", JSON.stringify(SAMPLE_TAGS));
    element.setAttribute("expanded", "false");
    dom.window.document.body.appendChild(element);

    let testComponent = /** @type {MessageTags} */ (
      dom.window.document.querySelector("ul")
    );
    let tags = testComponent.querySelectorAll("li");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    // Make sure the name actually shows up in the tag
    assert.match(tags[0].textContent, new RegExp(SAMPLE_TAGS[0].name));
  });

  it("Expanded tags", async (t) => {
    let element = dom.window.document.createElement("ul", {
      is: "message-tags",
    });
    element.setAttribute("tags", JSON.stringify(SAMPLE_TAGS));
    element.setAttribute("expanded", "true");
    dom.window.document.body.appendChild(element);

    let testComponent = /** @type {MessageTags} */ (
      dom.window.document.querySelector("ul")
    );
    let tags = testComponent.querySelectorAll("li");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    let button = tags[0].querySelector("span[role='button']");
    assert.ok(button, "Should have a button");

    let updateMock = t.mock.method(browser.messages, "update", () => {});
    button.click();

    await t.waitFor(() => {
      if (!updateMock.mock.callCount) {
        throw new Error("Not got one yet");
      }
    });
    // fireEvent.click(within(tags[0]).getByRole("button"));
    // assert.equal(callback.mock.calls.length, 1);

    // The callback should be called with a list of tags with the clicked
    // tag removed.
    const payload = updateMock.mock.calls[0].arguments[1].tags;
    assert.equal(payload.length, SAMPLE_TAGS.length - 1);
    assert.deepEqual(
      payload,
      SAMPLE_TAGS.slice(1).map((tag) => tag.key)
    );
  });

  it("Unexpanded tags", async (t) => {
    let element = dom.window.document.createElement("ul", {
      is: "message-tags",
    });
    element.setAttribute("tags", JSON.stringify(SAMPLE_TAGS));
    dom.window.document.body.appendChild(element);

    let testComponent = /** @type {MessageTags} */ (
      dom.window.document.querySelector("ul")
    );
    let tags = testComponent.querySelectorAll("li");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    let button = /** @type {MessageTag} */ (
      tags[0].querySelector("span[role='button']")
    );
    assert.ok(button, "Should have a button");

    // There should be no "x" button in an unexpanded tag
    assert.equal(button.style.display, "none");
  });
});
