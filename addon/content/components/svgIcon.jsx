/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";

/**
 * A basic SVG icon rendered using the `xlinkHref` ability
 * of SVGs. You can specify the full path, or just the hash.
 *
 * @param {object} root0
 * @param {string} [root0.fullPath]
 * @param {string} [root0.hash]
 * @param {string} [root0.ariaHidden]
 * @returns {React.ReactNode}
 */
export function SvgIcon({ fullPath, hash, ariaHidden = false }) {
  fullPath = fullPath || `material-icons.svg#${hash}`;
  return (
    <svg
      aria-hidden={ariaHidden}
      className="icon"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <use data-testid="use" xlinkHref={`icons/${fullPath}`}></use>
    </svg>
  );
}
SvgIcon.propTypes = {
  fullPath: PropTypes.string,
  hash: PropTypes.string,
  ariaHidden: PropTypes.bool,
};
