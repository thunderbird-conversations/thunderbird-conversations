/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

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
