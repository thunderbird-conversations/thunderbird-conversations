/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

    this.setState(prevState => ({expanded: !prevState.expanded}));
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
