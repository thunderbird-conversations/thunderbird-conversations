/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ReactRedux, StringBundle */
/* exported ContactDetail */

class _ContactDetail extends React.PureComponent {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
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
  }

  addContact() {
    this.props.dispatch({
      type: "ADD_CONTACT",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  createFilter() {
    this.props.dispatch({
      type: "CREATE_FILTER",
      email: this.props.realEmail,
    });
  }

  copyEmail() {
    this.props.dispatch({
      type: "COPY_EMAIL",
      email: this.props.realEmail,
    });
  }

  editContact() {
    this.props.dispatch({
      type: "EDIT_CONTACT",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  expandFooter() {
    this.setState({expanded: true});
  }

  sendEmail() {
    this.props.dispatch({
      type: "SEND_EMAIL",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  showInvolving() {
    this.props.dispatch({
      type: "SHOW_MESSAGES_INVOLVING",
      name: this.props.name,
      email: this.props.realEmail,
    });
  }

  render() {
    const name = this.props.name;
    const email = this.props.email;
    // TODO: Show monospace?
    return (
      <div className="tooltip" style={{left: this.props.left, top: this.props.top}} fadein={this.props.fadeIn}>
        <div className="arrow"></div>
        <div className="arrow inside"></div>
        <div className="authorInfoContainer">
          <div className="authorInfo">
            <span className="name" title={name}>{name}</span>
            <span className="authorEmail">
              <span className="authorEmailAddress" title={email}>{email}</span>
              <button className="copyEmail"
                      title={this.strings.get("copyEmail")}
                      onClick={this.copyEmail}>
                <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#content_copy"></use>
                </svg>
              </button>
            </span>
          </div>
          <div className="authorPicture">
            <img src={this.props.avatar} />
          </div>
        </div>
        { this.state.expanded &&
          <div className="tipFooter hiddenFooter">
            <button className="createFilter"
                    onClick={this.createFilter}>
              {this.strings.get("createFilter")}
            </button>
            { this.props.hasCard == "false" ?
              <button className="addContact"
                      title={this.strings.get("addToAb")}
                      onClick={this.addContact}>
                <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#add"></use>
                </svg>
              </button> :
              <button className="editContact"
                      title={this.strings.get("editCardAb")}
                      onClick={this.editContact}>
                <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#edit"></use>
                </svg>
              </button>
            }
          </div>
        }
        <div className="tipFooter">
          <button className="sendEmail"
                  title={this.strings.get("sendEmail")}
                  onClick={this.sendEmail}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#mail"></use>
            </svg>
          </button>
          <button className="showInvolving"
                  title={this.strings.get("recentConversations")}
                  onClick={this.showInvolving}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#history"></use>
            </svg>
          </button>
          { !this.state.expanded &&
            <button className="moreExpander"
                    title={this.strings.get("more")}
                    onClick={this.expandFooter}>
              <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#expand_more"></use>
              </svg>
            </button>
          }
        </div>
      </div>
    );
  }
}

_ContactDetail.propTypes = {
  dispatch: PropTypes.func.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  realEmail: PropTypes.string.isRequired,
  avatar: PropTypes.string.isRequired,
  hasCard: PropTypes.string.isRequired,
  left: PropTypes.number.isRequired,
  top: PropTypes.number.isRequired,
  fadeIn: PropTypes.string.isRequired,
};

const ContactDetail = ReactRedux.connect()(_ContactDetail);
