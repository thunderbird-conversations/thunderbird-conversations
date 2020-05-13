/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This module should be imported by all tests. It sets up
 * required global mocks and some compatibility between ES6 modules
 * and CJS modules, as required by Node. */

/* eslint-env node */

const esmImport = require("esm")(module, { cjs: true, force: true });
const { act } = require("react-dom/test-utils");
const enzyme = require("enzyme");
const Adapter = require("enzyme-adapter-react-16");

enzyme.configure({ adapter: new Adapter() });

// Browser code expects window to be the global object
global.window = global.globalThis = global;
// We need to make a global nodeRequire function so that our module
// loading will use native node module loading instead of the default.
global.nodeRequire = require;

// Mock `fetch`, which is used to get localization info when running in the browser
global.fetch = function (url) {
  const fileSystem = require("fs");
  const path = require("path");
  const ROOT_PATH = path.join(__dirname, "..");
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
const waitForComponentToPaint = async (wrapper) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    wrapper.update();
  });
};

//
// Load the modules for our tests. Since we are using native ESM
// modules here, we need to use esmImport to load the files.
//
const { browser, i18n } = esmImport(
  "../content/es-modules/thunderbird-compat.js"
);
// Import the same copy of React that the ui components are using
// because multiple versions of react can cause trouble. ui components
// import `ui.js`.
const { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes } = esmImport(
  "../content/es-modules/ui.js"
);

exports.esmImport = esmImport;
exports.act = act;
exports.enzyme = enzyme;
exports.waitForComponentToPaint = waitForComponentToPaint;
exports.browser = browser;
exports.i18n = i18n;
exports.React = React;
exports.ReactDOM = ReactDOM;
exports.Redux = Redux;
exports.ReactRedux = ReactRedux;
exports.RTK = RTK;
exports.PropTypes = PropTypes;
