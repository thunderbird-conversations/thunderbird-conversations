/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes:true, React */
/* exported SvgIcon */

if (typeof exports !== "undefined") {
  /* global require */
  PropTypes = require("../tests/utils").PropTypes;
}

/**
 * A basic SVG icon rendered using the `xlinkHref` ability
 * of SVGs. You can specify the full path, or just the hash.
 *
 * @param {*} { fullPath, hash }
 * @returns {React.ReactNode}
 */
function SvgIcon({ fullPath, hash }) {
  fullPath = fullPath || `material-icons.svg#${hash}`;
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <use xlinkHref={fullPath}></use>
    </svg>
  );
}
SvgIcon.propTypes = { fullPath: PropTypes.string, hash: PropTypes.string };

// This is temporary code to allow using using this as both
// an node module and as-is with global variables. This code
// should be removed when the transition to a WebExtension is
// complete.

/* global exports */
if (typeof exports !== "undefined") {
  exports.SvgIcon = SvgIcon;
}
