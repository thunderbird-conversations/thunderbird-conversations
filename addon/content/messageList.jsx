/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, ReactRedux, PropTypes, Message */
/* exported MessageList */

class _MessageList extends React.PureComponent {
  render() {
    return (
      <ul id="messageList">
        {!!this.props.messages.msgData &&
           this.props.messages.msgData.map((message, index) => (
          <Message key={index}
            dispatch={this.props.dispatch}
            displayingMultipleMsgs={!!this.props.messages.length}
            iframesLoading={this.props.summary.iframesLoading}
            index={index}
            message={message}
            prefs={this.props.summary.prefs}/>
        ))}
      </ul>
    );
  }
}

_MessageList.propTypes = {
  dispatch: PropTypes.func.isRequired,
  messages: PropTypes.object.isRequired,
  summary: PropTypes.object.isRequired,
};

const MessageList = ReactRedux.connect(state => {
  return {
    messages: state.messages,
    summary: state.summary,
  };
})(_MessageList);
