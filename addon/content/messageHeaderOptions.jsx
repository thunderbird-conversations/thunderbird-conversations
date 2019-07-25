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

/* globals PropTypes, React, ReactRedux, StringBundle, ActionButton */
/* exported MessageHeaderOptions */

class OptionsMoreMenu extends React.PureComponent {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
  }

  render() {
    return (
      <div className="tooltip tooltip-menu menu">
        <div className="arrow"></div>
        <div className="arrow inside"></div>
        <ul>
          <li className="action-reply">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="reply"/>
          </li>
          { this.props.multipleRecipients &&
            <li className="action-replyAll">
              <ActionButton callback={this.props.msgSendAction}
                            className="optionsButton"
                            showString={true}
                            type="replyAll"/>
            </li>
          }
          { this.props.recipientsIncludeLists &&
            <li className="action-replyList">
              <ActionButton callback={this.props.msgSendAction}
                            className="optionsButton"
                            showString={true}
                            type="replyList"/>
            </li>
          }
          <li className="action-editNew">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="editAsNew"/>
          </li>
          <li className="action-forward dropdown-sep">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="forward"/>
          </li>
          <li className="action-archive">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="archive"/>
          </li>
          <li className="action-delete">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="delete"/>
          </li>
          <li className="action-classic">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="classic"/>
          </li>
          <li className="action-source">
            <ActionButton callback={this.props.msgSendAction}
                          className="optionsButton"
                          showString={true}
                          type="source"/>
          </li>
        </ul>
      </div>
    );
  }
}

OptionsMoreMenu.propTypes = {
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  msgSendAction: PropTypes.func.isRequired,
};

class _MessageHeaderOptions extends React.PureComponent {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
    this.replyAction = this.replyAction.bind(this);
    this.displayMenu = this.displayMenu.bind(this);
    this.state = {
      expanded: false,
    };
  }

  componentWillUnmount() {
    if (this.clickListener) {
      document.removeEventListener("click", this.clickListener);
      document.removeEventListener("keypress", this.keyListener);
      this.clickListener = null;
      this.keyListener = null;
    }
  }

  replyAction(msg, event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      ...msg,
      msgUri: this.props.msgUri,
    });
  }

  displayMenu(event) {
    if (!this.clickListener) {
      this.clickListener = event => {
        this.clearMenu();
      };
      this.keyListener = event => {
        if (event.keyCode == KeyEvent.DOM_VK_ESCAPE) {
          this.clearMenu();
        }
      };
      document.addEventListener("click", this.clickListener);
      document.addEventListener("keypress", this.keyListener);
    }

    this.setState({expanded: !this.state.expanded});
  }

  clearMenu() {
    this.setState({expanded: false});
    if (this.clickListener) {
      document.removeEventListener("click", this.clickListener);
      document.removeEventListener("keypress", this.keyListener);
      this.clickListener = null;
      this.keyListener = null;
    }
  }

  render() {
    let actionButtonType = "reply";
    if (this.props.recipientsIncludeLists) {
      actionButtonType = "replyList";
    } else if (this.props.multipleRecipients) {
      actionButtonType = "replyAll";
    } else if (this.props.isDraft) {
      actionButtonType = "draft";
    }

    // TODO: Hide and show details buttons should have all control merged into here
    // once we've got more of the actual message display into react.
    return (
      <div className="options">
        { !!this.props.attachments.length &&
          <span className="attachmentIcon">
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#attachment"></use>
            </svg>
          </span>
        }
        <span className="date">
          <span title={this.props.fullDate}>{this.props.date}</span>
        </span>
        <span className="mainActionButton">
          <ActionButton callback={this.replyAction}
                        className="icon-link"
                        type={actionButtonType}/>
        </span>
        <span className="details hide-with-details">
          <a href="javascript:" className="icon-link" title={this.strings.get("details")}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#info_outline"></use>
            </svg>
          </a>
        </span>
        <span className="hide-details show-with-details">
          <a href="javascript:" className="icon-link" title={this.strings.get("hideDetails")}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#info"></use>
            </svg>
          </a>
        </span>
        <span className="dropDown">
          <button onClick={this.displayMenu} className="icon-link top-right-more" title={this.strings.get("more")}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#more_vert"></use>
            </svg>
          </button>
          { this.state.expanded &&
            <OptionsMoreMenu recipientsIncludeLists={this.props.recipientsIncludeLists}
                             msgSendAction={this.replyAction}
                             multipleRecipients={this.props.multipleRecipients}/>
          }
        </span>
      </div>
    );
  }
}

_MessageHeaderOptions.propTypes = {
  dispatch: PropTypes.func.isRequired,
  date: PropTypes.string.isRequired,
  fullDate: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  attachments: PropTypes.array.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
};

const MessageHeaderOptions = ReactRedux.connect()(_MessageHeaderOptions);
