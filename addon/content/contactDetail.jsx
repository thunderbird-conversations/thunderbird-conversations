/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ReactDOM, ReactRedux, SvgIcon, summaryActions */
/* exported ContactDetail */

class _ContactDetail extends React.PureComponent {
  constructor(props) {
    super(props);
    this.addContact = this.addContact.bind(this);
    this.editContact = this.editContact.bind(this);
    this.createFilter = this.createFilter.bind(this);
    this.copyEmail = this.copyEmail.bind(this);
    this.sendEmail = this.sendEmail.bind(this);
    this.showInvolving = this.showInvolving.bind(this);
    this.onGeneralClick = this.onGeneralClick.bind(this);
  }

  onGeneralClick(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  addContact(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.addContact({
        name: this.props.name,
        email: this.props.realEmail,
      })
    );
  }

  createFilter(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.createFilter({
        email: this.props.realEmail,
      })
    );
  }

  copyEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.copyEmail({ email: this.props.realEmail })
    );
  }

  editContact(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.editContact({ email: this.props.realEmail })
    );
  }

  sendEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.sendEmail({
        name: this.props.name,
        email: this.props.realEmail,
      })
    );
  }

  showInvolving(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch(
      summaryActions.showMessagesInvolving({
        name: this.props.name,
        email: this.props.realEmail,
      })
    );
  }

  render() {
    const name = this.props.name;
    const pos = (this.props.parentSpan &&
      this.props.parentSpan.getBoundingClientRect()) || {
      left: 0,
      top: 0,
      bottom: 0,
    };
    const elm = (
      <div
        className="tooltip"
        style={{
          left: pos.left,
          top: pos.top + window.scrollY + (pos.bottom - pos.top) * 2,
        }}
        onClick={this.onGeneralClick}
      >
        <div className="arrow"></div>
        <div className="arrow inside"></div>
        <div className="authorInfoContainer">
          <div className="authorInfo">
            <span className="name" title={name}>
              {name}
            </span>
            <span className="authorEmail">
              <span className="authorEmailAddress" title={this.props.realEmail}>
                {this.props.realEmail}
              </span>
              <button
                className="copyEmail"
                title={browser.i18n.getMessage("contact.copyEmailTooltip")}
                onClick={this.copyEmail}
              >
                <SvgIcon hash={"content_copy"} />
              </button>
            </span>
          </div>
          <div className="authorPicture">
            <img src={this.props.avatar} />
          </div>
        </div>
        <div className="tipFooter">
          <button
            className="sendEmail"
            title={browser.i18n.getMessage("contact.sendEmailTooltip")}
            onClick={this.sendEmail}
          >
            <SvgIcon hash={"mail"} />
          </button>
          <button
            className="showInvolving"
            title={browser.i18n.getMessage(
              "contact.recentConversationsTooltip"
            )}
            onClick={this.showInvolving}
          >
            <SvgIcon hash={"history"} />
          </button>
          {this.props.contactId ? (
            <button
              className="editContact"
              title={browser.i18n.getMessage("contact.editContactTooltip")}
              onClick={this.editContact}
            >
              <SvgIcon hash={"edit"} />
            </button>
          ) : (
            <button
              className="addContact"
              title={browser.i18n.getMessage("contact.addContactTooltip")}
              onClick={this.addContact}
            >
              <SvgIcon hash={"add"} />
            </button>
          )}
          <button className="createFilter" onClick={this.createFilter}>
            {browser.i18n.getMessage("contact.createFilterTooltip")}
          </button>
        </div>
      </div>
    );
    // In TB 68, when an element with `tabIndex` gets focused,
    // it gets set as the position parent. It shouldn't. To resolve
    // this issue, reparent the popup to <body> so its parent will never
    // change. See https://github.com/thunderbird-conversations/thunderbird-conversations/pull/1432
    return ReactDOM.createPortal(elm, document.querySelector("body"));
  }
}

_ContactDetail.propTypes = {
  dispatch: PropTypes.func.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  realEmail: PropTypes.string.isRequired,
  avatar: PropTypes.string.isRequired,
  contactId: PropTypes.string,
  parentSpan: PropTypes.object.isRequired,
};

const ContactDetail = ReactRedux.connect()(_ContactDetail);
