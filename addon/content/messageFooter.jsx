/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ActionButton */
/* exported MessageFooter */

class MessageFooter extends React.PureComponent {
  constructor(props) {
    super(props);
    this.action = this.action.bind(this);
  }

  action(msg) {
    msg.msgUri = this.props.msgUri;
    msg.id = this.props.id;
    this.props.dispatch(msg);
  }

  render() {
    return (
      <div className="messageFooter">
        <div className="footerActions">
          {this.props.isDraft && (
            <ActionButton callback={this.action} type="draft" />
          )}
          {!this.props.isDraft && (
            <ActionButton callback={this.action} type="reply" />
          )}
          {!this.props.isDraft && this.props.multipleRecipients && (
            <ActionButton callback={this.action} type="replyAll" />
          )}
          {!this.props.isDraft && this.props.recipientsIncludeLists && (
            <ActionButton callback={this.action} type="replyList" />
          )}
          {!this.props.isDraft && (
            <ActionButton callback={this.action} type="forward" />
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
