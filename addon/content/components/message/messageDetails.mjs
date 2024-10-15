/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { DetailedContactLabel } from "./messageHeader.mjs";

function ContactList({ label, contacts, className = "", msgId }) {
  if (contacts.length === 0) {
    return null;
  }
  return React.createElement(
    "div",
    { className },
    React.createElement("u", null, label),
    " ",
    contacts.map((contact, i) =>
      React.createElement(
        React.Fragment,
        { key: i },
        React.createElement(DetailedContactLabel, {
          className: "",
          contact,
          msgId,
        }),
        React.createElement("br")
      )
    )
  );
}
ContactList.propTypes = {
  label: PropTypes.string.isRequired,
  contacts: PropTypes.array.isRequired,
  className: PropTypes.string,
  msgId: PropTypes.number.isRequired,
};

/**
 * Handles display of the extended details for a message - the header lines.
 */
export class MessageDetails extends React.PureComponent {
  render() {
    return React.createElement(
      "div",
      null,
      !!this.props.from &&
        React.createElement(
          "div",
          { className: "detailsLine fromLine" },
          React.createElement(
            "u",
            null,
            browser.i18n.getMessage("message.fromHeader")
          ),
          " ",
          React.createElement(DetailedContactLabel, {
            className: "",
            contact: this.props.from,
            msgId: this.props.id,
          })
        ),
      React.createElement(ContactList, {
        className: "detailsLine toLine",
        label: browser.i18n.getMessage("message.toHeader"),
        contacts: this.props.to,
        msgId: this.props.id,
      }),
      React.createElement(ContactList, {
        className: "detailsLine ccLine",
        label: browser.i18n.getMessage("message.ccHeader"),
        contacts: this.props.cc,
        msgId: this.props.id,
      }),
      React.createElement(ContactList, {
        className: "detailsLine bccLine",
        label: browser.i18n.getMessage("compose.fieldBcc"),
        contacts: this.props.bcc,
        msgId: this.props.id,
      }),
      !!this.props.extraLines?.length &&
        this.props.extraLines.map((line, i) => {
          return React.createElement(
            "div",
            { className: "detailsLine", key: i },
            React.createElement("u", null, `${line.key}:`),
            ` ${line.value}`
          );
        })
    );
  }
}

MessageDetails.propTypes = {
  bcc: PropTypes.array.isRequired,
  cc: PropTypes.array.isRequired,
  extraLines: PropTypes.array,
  from: PropTypes.object,
  id: PropTypes.number.isRequired,
  to: PropTypes.array.isRequired,
};
