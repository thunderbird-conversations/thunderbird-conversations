/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ActionButton, messageActions */
/* exported MessageFooter */

class MessageFooter extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onActionButtonClick = this.onActionButtonClick.bind(this);
  }

  onActionButtonClick(msg) {
    const payload = {
      id: this.props.id,
      msgUri: this.props.msgUri,
      shiftKey: msg.shiftKey,
    };
    let action = null;
    switch (msg.type) {
      case "draft":
        action = messageActions.editDraft(payload);
        break;
      case "reply":
        action = messageActions.reply(payload);
        break;
      case "replyAll":
        action = messageActions.replyAll(payload);
        break;
      case "replyList":
        action = messageActions.replyList(payload);
        break;
      case "forward":
        action = messageActions.forward(payload);
        break;
      default:
        console.error("Don't know how to create an action for", msg);
    }
    this.props.dispatch(action);
  }

  render() {
    return (
      <div className="messageFooter">
        <div className="footerActions">
          {this.props.isDraft && (
            <ActionButton callback={this.onActionButtonClick} type="draft" />
          )}
          {!this.props.isDraft && (
            <ActionButton callback={this.onActionButtonClick} type="reply" />
          )}
          {!this.props.isDraft && this.props.multipleRecipients && (
            <ActionButton callback={this.onActionButtonClick} type="replyAll" />
          )}
          {!this.props.isDraft && this.props.recipientsIncludeLists && (
            <ActionButton
              callback={this.onActionButtonClick}
              type="replyList"
            />
          )}
          {!this.props.isDraft && (
            <ActionButton callback={this.onActionButtonClick} type="forward" />
          )}
        </div>
      </div>
    );
  }
}

MessageFooter.propTypes = {
  dispatch: PropTypes.func.isRequired,
  id: PropTypes.number.isRequired,
  msgUri: PropTypes.string.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
};
