/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// We assume all these have been loaded as globals before this module is executed
for (const lib of [
  "React",
  "ReactDOM",
  "Redux",
  "ReactRedux",
  "RTK",
  "PropTypes",
]) {
  if (!window[lib]) {
    console.warn(
      "Assumed",
      lib,
      `was a globally accessible library, but window.${lib} is not defined.`
    );
  }
}

const React = window.React;
const ReactDOM = window.ReactDOM;
const Redux = window.Redux;
const ReactRedux = window.ReactRedux;
const RTK = window.RTK;
const PropTypes = window.PropTypes;

export { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes };
