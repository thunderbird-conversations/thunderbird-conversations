/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-env node */

import { browser } from "../content/esmodules/thunderbirdCompat.mjs";
import fileSystem from "fs";
import path from "path";

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

browser.i18n.initialize();

globalThis.browser = browser;
