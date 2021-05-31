/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { browser } from "../../es-modules/thunderbird-compat.js";

export const TextBox = React.forwardRef(
  ({ disabled = false, title, value = "", name, onChange = () => {} }, ref) => {
    return (
      <React.Fragment>
        <div>
          <label>{browser.i18n.getMessage(title)}</label>
        </div>
        <div>
          <input
            type="text"
            ref={ref}
            value={value}
            onChange={(e) => {
              onChange(name, e.target.value);
            }}
            disabled={disabled}
          />
        </div>
      </React.Fragment>
    );
  }
);
TextBox.displayName = "TextBox";
TextBox.propTypes = {
  disabled: PropTypes.bool,
  title: PropTypes.string.isRequired,
  value: PropTypes.string,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export const TextArea = React.forwardRef(
  ({ value = "", name, onChange = () => {} }, ref) => {
    return (
      <React.Fragment>
        <div></div>
        <div>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              onChange(name, e.target.value);
            }}
          />
        </div>
      </React.Fragment>
    );
  }
);
TextArea.displayName = "TextArea";
TextArea.propTypes = {
  value: PropTypes.string,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
