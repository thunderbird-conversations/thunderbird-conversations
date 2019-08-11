/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, MessageHeaderOptions, StringBundle */
/* exported MessageHeader */

class ContactLabel extends React.PureComponent {
  render() {
    return (
      <span className={this.props.className}>
        <span>{this.props.contact.separator}</span>
          <span className="tooltipWrapper contact">
            <span className="contactName"
                  name={this.props.contact.name}
                  email={this.props.contact.displayEmail}
                  realemail={this.props.contact.email}
                  avatar={this.props.contact.avatar}>
              {this.props.contact.detail && this.props.contact.hasCard && "&#x2605; "}
              {this.props.contact.name.trim()}
              {this.props.contact.extra &&
                <label xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
                  crop="center"
                  className="contactExtra"
                  value={`(${this.props.contact.extra})`}/>
              }
              {this.props.contact.displayEmail &&
                <span className="smallEmail"> &lt;{this.props.contact.displayEmail.trim()}&gt;</span>
              }
              {this.props.contact.detail && <br />}
          </span>
        </span>
      </span>
    );
  }
}

ContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  detail: PropTypes.bool.isRequired,
};

class MessageHeader extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
  }

  render() {
    return (
      <div className="messageHeader hbox">
        <div className="shrink-box">
          <div className={"star" + (this.props.starred ? " starred" : "")}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#star">
              </use>
            </svg>
          </div>
          {this.props.from.avatarIsDefault ?
            <abbr className="contactInitials"
                  style={this.props.from.colorStyle}>
              {this.props.from.initials}
            </abbr> :
            <span className="contactAvatar" style={{backgroundImage: `url('${this.props.from.avatar}')`}}>
              {"\u00a0"}
            </span>
          }
          {" "}
          <ContactLabel
            className="author"
            contact={this.props.from}
            detail={false}/>
          {this.strings.get("to")}
          {" "}
          {this.props.to.map((contact, index) =>
            <ContactLabel
              className="to"
              contact={contact}
              detail={false}
              key={index}/>
          )}
        </div>
        <MessageHeaderOptions
          dispatch={this.props.dispatch}
          date={this.props.date}
          fullDate={this.props.fullDate}
          msgUri={this.props.msgUri}
          attachments={this.props.attachments}
          multipleRecipients={this.props.multipleRecipients}
          recipientsIncludeLists={this.props.recipientsIncludeLists}
          isDraft={this.props.isDraft}/>
      </div>
    );
  }
}

MessageHeader.propTypes = {
  dispatch: PropTypes.func.isRequired,
  date: PropTypes.string.isRequired,
  from: PropTypes.object.isRequired,
  fullDate: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  attachments: PropTypes.array.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
  starred: PropTypes.bool.isRequired,
  to: PropTypes.array.isRequired,
};
