/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, ReactRedux, PropTypes, Message */
/* exported MessageList */

class _MessageList extends React.PureComponent {
  render() {
    return (
      <ul id="messageList">
        {!!this.props.msgData && this.props.msgData.map((message, index) => (
          <Message key={index}
            dispatch={this.props.dispatch}
            index={index}
            message={message}/>
        ))}
      </ul>
    );
  }
}

_MessageList.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgData: PropTypes.array.isRequired,
};

const MessageList = ReactRedux.connect(state => state.messages)(_MessageList);
