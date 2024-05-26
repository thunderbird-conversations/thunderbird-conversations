/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";

export const TextBox = React.forwardRef(
  ({ disabled = false, title, value = "", name, onChange = () => {} }, ref) => {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: "headerField" },
        React.createElement(
          "label",
          { htmlFor: name },
          browser.i18n.getMessage(title)
        ),
        React.createElement(
          "div",
          { className: "headerEntry" },
          React.createElement("input", {
            id: name,
            type: "text",
            ref,
            value,
            onChange: (e) => {
              onChange(name, e.target.value);
            },
            disabled,
          })
        )
      )
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
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        { className: `${name}Wrapper` },
        React.createElement("textarea", {
          id: name,
          className: name,
          ref,
          value,
          onChange: (e) => onChange(name, e.target.value),
        })
      )
    );
  }
);
TextArea.displayName = "TextArea";
TextArea.propTypes = {
  value: PropTypes.string,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};
