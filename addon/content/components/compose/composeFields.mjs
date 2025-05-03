/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";

/**
 * A renderer for a text box.
 *
 * @param {object} options
 * @param {boolean} options.disabled
 * @param {string} options.title
 * @param {string} options.value
 * @param {string} options.name
 * @param {(name: string, value: string) => void} options.onChange
 * @param {*} ref
 */
function TextBoxRenderer(
  { disabled = false, title, value = "", name, onChange },
  ref
) {
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

export const TextBox = React.forwardRef(TextBoxRenderer);
TextBox.displayName = "TextBox";

/**
 * Renderer for a text area.
 *
 * @param {object} options
 * @param {string} [options.value]
 * @param {string} options.name
 * @param {(name: string, value: string) => void} options.onChange
 * @param {*} ref
 */
function TextAreaRenderer({ value = "", name, onChange = () => {} }, ref) {
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

export const TextArea = React.forwardRef(TextAreaRenderer);
TextArea.displayName = "TextArea";
