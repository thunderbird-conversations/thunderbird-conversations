/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// `amdModules` will be an array of AMD module initialization information.
// It is up to us to initialize all the modules in the proper order and re-export them.
import { amdModules, callWithDeps } from "./modules-compat.js";

// Load vendor modules as AMD modules
// IMPORTANT: the order here must be kept in sync
// with `amdModuleNames` and the order must resolve deps.
// e.g., `react-dom` must come after `react`, since `react` is a
// dependency of `react-dom`
import "../vendor/react.js";
import "../vendor/react-dom.js";
import "../vendor/redux.js";
import "../vendor/react-redux.js";
import "../vendor/redux-toolkit.umd.js";
import "../vendor/prop-types.js";

const initializedDeps = {};

// These names must be in the same order as the AMD modules were imported
const amdModuleNames = [
  "react",
  "react-dom",
  "redux",
  "react-redux",
  "redux-toolkit",
  "prop-types",
];
amdModuleNames.forEach((name, i) => {
  const amdItem = amdModules[i];
  if (!amdItem) {
    throw new Error(
      `An ${i}th AMD module was assumed to be loaded, but none was found`
    );
  }
  initializedDeps[name] = callWithDeps(amdItem, initializedDeps);
});

const React = initializedDeps["react"];
const ReactDOM = initializedDeps["react-dom"];
const Redux = initializedDeps["redux"];
const ReactRedux = initializedDeps["react-redux"];
const RTK = initializedDeps["redux-toolkit"];
const PropTypes = initializedDeps["prop-types"];

export { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes };
