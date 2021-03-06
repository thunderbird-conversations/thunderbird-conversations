/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { DetailedContactLabel } from "./messageHeader.jsx";

function ContactList({ label, contacts, className = "" }) {
  if (contacts.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      <u>{label}</u>{" "}
      {contacts.map((contact, i) => (
        <React.Fragment key={i}>
          <DetailedContactLabel className="" contact={contact} />
          <br />
        </React.Fragment>
      ))}
    </div>
  );
}
ContactList.propTypes = {
  label: PropTypes.string.isRequired,
  contacts: PropTypes.array.isRequired,
  className: PropTypes.string,
};

export class MessageDetails extends React.PureComponent {
  render() {
    return (
      <div>
        {!!this.props.from && (
          <div className="detailsLine fromLine">
            <u>{browser.i18n.getMessage("message.fromHeader")}</u>{" "}
            <DetailedContactLabel className="" contact={this.props.from} />
          </div>
        )}
        <ContactList
          className="detailsLine toLine"
          label={browser.i18n.getMessage("message.toHeader")}
          contacts={this.props.to}
        />
        <ContactList
          className="detailsLine ccLine"
          label={browser.i18n.getMessage("message.ccHeader")}
          contacts={this.props.cc}
        />
        <ContactList
          className="detailsLine bccLine"
          label={browser.i18n.getMessage("compose.fieldBcc")}
          contacts={this.props.bcc}
        />
        {!!this.props.extraLines?.length &&
          this.props.extraLines.map((line, i) => {
            return (
              <div className="detailsLine" key={i}>
                <u>{line.key}:</u> {line.value}
              </div>
            );
          })}
      </div>
    );
  }
}

MessageDetails.propTypes = {
  bcc: PropTypes.array.isRequired,
  cc: PropTypes.array.isRequired,
  extraLines: PropTypes.array,
  from: PropTypes.object.isRequired,
  to: PropTypes.array.isRequired,
};
