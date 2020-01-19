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

// We export these as modules, but we load the modules differently
// depending on whether the environment is node or browser/thunderbird
let React = null;
let ReactDOM = null;
let Redux = null;
let ReactRedux = null;
let RTK = null;
let PropTypes = null;

if (typeof nodeRequire === "function") {
  /*global nodeRequire*/
  //
  // Node.js Environment
  //
  // If `nodeRequire` is defined, we are in a node environment
  // (most likely for testing) and we should use the node require function.
  // If we don't, we risk having multiple copies of React loaded at once.
  React = nodeRequire("react");
  ReactDOM = nodeRequire("react-dom");
  Redux = nodeRequire("redux");
  ReactRedux = nodeRequire("react-redux");
  RTK = nodeRequire("@reduxjs/toolkit");
  PropTypes = nodeRequire("prop-types");
} else {
  //
  // Browser/Thunderbird Environment
  //
  // In a browser environment, we simulate AMD module loading so that we
  // can pass in dependencies appropriately.
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

  React = initializedDeps.react;
  ReactDOM = initializedDeps["react-dom"];
  Redux = initializedDeps.redux;
  ReactRedux = initializedDeps["react-redux"];
  RTK = initializedDeps["redux-toolkit"];
  PropTypes = initializedDeps["prop-types"];
}

export { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes };
