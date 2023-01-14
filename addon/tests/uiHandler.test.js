/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { jest } from "@jest/globals";
import { UIHandler } from "../background/uiHandler.js";

describe("getDefaultIdentity", () => {
  let uiHandler;

  beforeEach(() => {
    browser.storage.initForTests();
    uiHandler = new UIHandler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should get the default identity", async () => {
    let defaultId = await uiHandler.getDefaultIdentity();

    expect(defaultId).toStrictEqual("id3");
  });

  test("should get the default identity with different setup", async () => {
    jest.spyOn(browser.accounts, "getDefault").mockImplementation(async () => {
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
    jest
      .spyOn(browser.identities, "getDefault")
      .mockImplementation(async () => {
        return {
          id: "id5",
          email: `id5@example.com`,
        };
      });
    let defaultId = await uiHandler.getDefaultIdentity();

    expect(defaultId).toBe("id5");
  });
});

describe("openQuickCompose", () => {
  let uiHandler;
  let mockedTabCreate;
  let mockedWindowCreate;

  beforeEach(() => {
    mockedTabCreate = jest.spyOn(browser.tabs, "create");
    mockedWindowCreate = jest.spyOn(browser.windows, "create");
  });

  beforeEach(() => {
    uiHandler = new UIHandler();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should use the default identity if not a normal window", async () => {
    jest.spyOn(browser.windows, "getCurrent").mockImplementation(async () => {
      return {
        focused: true,
        id: "2",
        type: "popup",
      };
    });

    await uiHandler.openQuickCompose();

    expect(mockedTabCreate).toHaveBeenCalledWith({
      url: "../compose/compose.html?identityId=id3",
    });
    expect(mockedWindowCreate).not.toHaveBeenCalled();
  });

  test("should open a window if set in preferences", async () => {
    jest.spyOn(browser.windows, "getCurrent").mockImplementation(async () => {
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

    expect(mockedTabCreate).not.toHaveBeenCalled();
    expect(mockedWindowCreate).toHaveBeenCalledWith({
      url: "../compose/compose.html?identityId=id3",
      type: "popup",
      width: 1024,
      height: 600,
    });

    await browser.storage.local.set(oldValue);
  });

  test("should use the id of the displayed message", async () => {
    await uiHandler.openQuickCompose();

    expect(mockedTabCreate).toHaveBeenCalledWith({
      url: "../compose/compose.html?identityId=idac34",
    });
    expect(mockedWindowCreate).not.toHaveBeenCalled();
  });
});
