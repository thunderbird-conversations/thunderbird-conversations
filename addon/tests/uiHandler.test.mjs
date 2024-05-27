/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { UIHandler } from "../background/uiHandler.mjs";

describe("getDefaultIdentity", () => {
  let uiHandler;

  beforeEach(() => {
    browser.storage.initForTests();
    uiHandler = new UIHandler();
  });

  it("should get the default identity", async () => {
    let defaultId = await uiHandler.getDefaultIdentity();

    assert.equal(defaultId, "id3");
  });

  it("should get the default identity with different setup", async (t) => {
    t.mock
      .method(browser.accounts, "getDefault")
      .mock.mockImplementation(async () => {
        return {
          id: "ac5",
          identities: [
            {
              id: `id5`,
              email: `id5@example.com`,
            },
          ],
        };
      });
    t.mock
      .method(browser.identities, "getDefault")
      .mock.mockImplementation(async () => {
        return {
          id: "id5",
          email: `id5@example.com`,
        };
      });
    let defaultId = await uiHandler.getDefaultIdentity();

    assert.equal(defaultId, "id5");
  });
});

describe("openQuickCompose", () => {
  let uiHandler;
  let mockedTabCreate;
  let mockedWindowCreate;

  beforeEach((t) => {
    mockedTabCreate = t.mock.method(browser.tabs, "create");
    mockedWindowCreate = t.mock.method(browser.windows, "create");
  });

  beforeEach(() => {
    uiHandler = new UIHandler();
  });

  it("should use the default identity if not a normal window", async (t) => {
    t.mock
      .method(browser.windows, "getCurrent")
      .mock.mockImplementation(async () => {
        return {
          focused: true,
          id: "2",
          type: "popup",
        };
      });

    await uiHandler.openQuickCompose();

    assert.deepEqual(mockedTabCreate.mock.calls[0].arguments[0], {
      url: "../compose/compose.html?identityId=id3",
    });
    assert.equal(mockedWindowCreate.mock.calls.length, 0);
  });

  it("should open a window if set in preferences", async (t) => {
    t.mock
      .method(browser.windows, "getCurrent")
      .mock.mockImplementation(async () => {
        return {
          focused: true,
          id: "2",
          type: "popup",
        };
      });

    let oldValue = await browser.storage.local.get("preferences");
    let newValue = {
      preferences: { ...oldValue.preferences, compose_in_tab: false },
    };
    await browser.storage.local.set(newValue);

    await uiHandler.openQuickCompose();

    assert.equal(mockedTabCreate.mock.calls.length, 0);
    assert.deepEqual(mockedWindowCreate.mock.calls[0].arguments[0], {
      url: "../compose/compose.html?identityId=id3",
      type: "popup",
      width: 1024,
      height: 600,
    });

    await browser.storage.local.set(oldValue);
  });

  it("should use the id of the displayed message", async () => {
    await uiHandler.openQuickCompose();

    assert.deepEqual(mockedTabCreate.mock.calls[0].arguments[0], {
      url: "../compose/compose.html?identityId=idac34",
    });
    assert.equal(mockedWindowCreate.mock.calls.length, 0);
  });
});
