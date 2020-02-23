/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ReactDOM, ReactRedux, StringBundle */
/* exported ContactDetail */

class _ContactDetail extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle(
      "chrome://conversations/locale/template.properties"
    );
    this.state = {
      expanded: false,
    };
    this.addContact = this.addContact.bind(this);
    this.editContact = this.editContact.bind(this);
    this.expandFooter = this.expandFooter.bind(this);
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
    this.props.dispatch({
      type: "ADD_CONTACT",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  createFilter(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "CREATE_FILTER",
      email: this.props.realEmail,
    });
  }

  copyEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "COPY_EMAIL",
      email: this.props.realEmail,
    });
  }

  editContact(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "EDIT_CONTACT",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  expandFooter(event) {
    event.stopPropagation();
    event.preventDefault();
    this.setState({ expanded: true });
  }

  sendEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "SEND_EMAIL",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  showInvolving(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "SHOW_MESSAGES_INVOLVING",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  render() {
    const name = this.props.name;
    const pos = (this.props.parentSpan &&
      this.props.parentSpan.getBoundingClientRect()) || {
      left: 0,
      top: 0,
      bottom: 0,
    };
    // TODO: Show monospace?
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
                title={this.strings.get("copyEmail")}
                onClick={this.copyEmail}
              >
                <svg
                  className="icon"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#content_copy"></use>
                </svg>
              </button>
            </span>
          </div>
          <div className="authorPicture">
            <img src={this.props.avatar} />
          </div>
        </div>
        {this.state.expanded && (
          <div className="tipFooter hiddenFooter">
            <button className="createFilter" onClick={this.createFilter}>
              {this.strings.get("createFilter")}
            </button>
            {this.props.hasCard ? (
              <button
                className="editContact"
                title={this.strings.get("editCardAb")}
                onClick={this.editContact}
              >
                <svg
                  className="icon"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#edit"></use>
                </svg>
              </button>
            ) : (
              <button
                className="addContact"
                title={this.strings.get("addToAb")}
                onClick={this.addContact}
              >
                <svg
                  className="icon"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#add"></use>
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="tipFooter">
          <button
            className="sendEmail"
            title={this.strings.get("sendEmail")}
            onClick={this.sendEmail}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
            >
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#mail"></use>
            </svg>
          </button>
          <button
            className="showInvolving"
            title={this.strings.get("recentConversations")}
            onClick={this.showInvolving}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
            >
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#history"></use>
            </svg>
          </button>
          {!this.state.expanded && (
            <button
              className="moreExpander"
              title={this.strings.get("more")}
              onClick={this.expandFooter}
            >
              <svg
                className="icon"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
              >
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#expand_more"></use>
              </svg>
            </button>
          )}
        </div>
      </div>
    );
    // In TB 68, when an element with `tabIndex` gets focused,
    // it gets set as the position parent. It shouldn't. To resolve
    // this issue, reparent the popup to <body> so its parent will never
    // change. See https://github.com/protz/thunderbird-conversations/pull/1432
    return ReactDOM.createPortal(elm, document.querySelector("body"));
  }
}

_ContactDetail.propTypes = {
  dispatch: PropTypes.func.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  realEmail: PropTypes.string.isRequired,
  avatar: PropTypes.string.isRequired,
  hasCard: PropTypes.bool.isRequired,
  parentSpan: PropTypes.object.isRequired,
};

const ContactDetail = ReactRedux.connect()(_ContactDetail);
