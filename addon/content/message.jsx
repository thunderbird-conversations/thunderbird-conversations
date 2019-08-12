/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, Attachments, MessageHeader, MessageFooter,
           MessageIFrame */
/* exported Message */

class Message extends React.PureComponent {
  render() {
    return (
      <li className="message">
        <MessageHeader
          dispatch={this.props.dispatch}
          date={this.props.message.date}
          expanded={this.props.message.expanded}
          from={this.props.message.from}
          to={this.props.message.to}
          fullDate={this.props.message.fullDate}
          msgUri={this.props.message.msgUri}
          attachments={this.props.message.attachments}
          multipleRecipients={this.props.message.multipleRecipients}
          recipientsIncludeLists={this.props.message.recipientsIncludeLists}
          isDraft={this.props.message.isDraft}
          snippet={this.props.message.snippet}
          starred={this.props.message.starred}/>
        <div className="messageBody">
          <MessageIFrame
            dispatch={this.props.dispatch}
            expanded={this.props.message.expanded}
            msgUri={this.props.message.msgUri}
            neckoUrl={this.props.message.neckoUrl}/>
          {this.props.message.expanded && !!this.props.message.attachments.length &&
            <Attachments
              dispatch={this.props.dispatch}
              attachments={this.props.message.attachments}
              attachmentsPlural={this.props.message.attachmentsPlural}
              msgUri={this.props.message.msgUri}
              gallery={this.props.message.gallery}/>
          }
        </div>
        {this.props.message.expanded &&
          <MessageFooter
            dispatch={this.props.dispatch}
            msgUri={this.props.message.msgUri}
            multipleRecipients={this.props.message.multipleRecipients}
            recipientsIncludeLists={this.props.message.recipientsIncludeLists}
            isDraft={this.props.message.isDraft}/>
        }
      </li>
    );
  }
}

Message.propTypes = {
  dispatch: PropTypes.func.isRequired,
  index: PropTypes.number.isRequired,
  message: PropTypes.object.isRequired,
};
