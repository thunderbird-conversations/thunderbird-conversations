/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This module should be imported by all tests. It sets up
 * required global mocks and some compatibility between ES6 modules
 * and CJS modules, as required by Node. */

/* eslint-env node */

import Enzyme from "enzyme";
import Adapter from "@wojtekmaj/enzyme-adapter-react-17";
import testUtils from "react-dom/test-utils";
import fileSystem from "fs";
import path from "path";

Enzyme.configure({ adapter: new Adapter() });

export var enzyme = Enzyme;

// Mock `fetch`, which is used to get localization info when running in the browser
globalThis.fetch = function (url) {
  const ROOT_PATH = path.join(__dirname, "..", "addon");
  const filePath = path.join(ROOT_PATH, url);

  const data = fileSystem.readFileSync(filePath, "utf8");
  return Promise.resolve({
    json() {
      return Promise.resolve(JSON.parse(data));
    },
  });
};

// Workaround for warnings about component not being wrapped in `act()`/
// Taken from https://github.com/airbnb/enzyme/issues/2073#issuecomment-565736674
export const waitForComponentToPaint = async (wrapper) => {
  await testUtils.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    wrapper.update();
  });
};

export function createFakeData(
  {
    id = 0,
    attachments = [],
    bugzilla = false,
    detailsShowing,
    flagged = false,
    folderType = "inbox",
    folderName = "Inbox",
    initialPosition = 0,
    junk = false,
    read = false,
    subject = "Fake Msg",
    snippet = "",
    tags = [],
  } = {},
  fakeMessageHeaderData
) {
  let data = {
    id,
    attachments,
    bugzilla,
    date: Date.now(),
    initialPosition,
    snippet,
    _contactsData: [],
  };
  if (detailsShowing !== undefined) {
    data.detailsShowing = detailsShowing;
  }

  fakeMessageHeaderData.set(id, {
    date: new Date(data.date),
    flagged,
    folder: {
      type: folderType,
      name: folderName,
    },
    junk,
    read,
    subject,
    tags,
  });

  return data;
}

export function createFakeSummaryData(prefs = {}) {
  return {
    prefs: {
      noFriendlyDate: false,
      expandWho: 4,
      ...prefs,
    },
  };
}
