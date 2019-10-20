/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, ContactLabel */
/* exported MessageDetails */

class ContactLine extends React.PureComponent {
  render() {
    return this.props.contacts.map((to, i) => {
      return (
        <ContactLabel className="" contact={to} detailView={true} key={i} />
      );
    });
  }
}

ContactLine.propTypes = {
  className: PropTypes.string.isRequired,
  contacts: PropTypes.array.isRequired,
};

class MessageDetails extends React.PureComponent {
  render() {
    return (
      <div>
        {!!this.props.from && (
          <div className="detailsLine fromLine">
            <u>{this.props.strings.get("fieldFrom")}</u>{" "}
            <ContactLabel
              className=""
              contact={this.props.from}
              detailView={true}
            />
          </div>
        )}
        {!!this.props.to.length && (
          <div className="detailsLine toLine">
            <u>{this.props.strings.get("fieldTo")}</u>{" "}
            <ContactLine className="to" contacts={this.props.to} />
          </div>
        )}
        {!!this.props.cc.length && (
          <div className="detailsLine ccLine">
            <u>{this.props.strings.get("fieldCc")}</u>{" "}
            <ContactLine className="cc" contacts={this.props.cc} />
          </div>
        )}
        {!!this.props.bcc.length && (
          <div className="detailsLine bccLine">
            <u>{this.props.strings.get("fieldBcc")}</u>{" "}
            <ContactLine className="bcc" contacts={this.props.bcc} />
          </div>
        )}
        {this.props.extraLines &&
          !!this.props.extraLines.length &&
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
  extraLines: PropTypes.array.isRequired,
  from: PropTypes.object.isRequired,
  strings: PropTypes.object.isRequired,
  to: PropTypes.array.isRequired,
};
