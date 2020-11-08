/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, ReactRedux, PropTypes, Message */
/* exported MessageList */

function _MessageList(props) {
  // Keep a reference to child elements so `.focus()`
  // can be called on them in response to a `advanceMessage()`
  // call. The actual ref is stored in `React.useRef().current`
  const { current: childRefs } = React.useRef([]);

  function setRef(index, ref) {
    childRefs[index] = ref;
  }

  function advanceMessage(index, step) {
    const ref = childRefs[index + step];
    if (!ref) {
      return;
    }
    ref.focus();
  }

  return (
    <ul id="messageList">
      {!!props.messages.msgData &&
        props.messages.msgData.map((message, index) => (
          <Message
            key={index}
            autoMarkAsRead={props.summary.autoMarkAsRead}
            browserBackgroundColor={props.summary.browserBackgroundColor}
            browserForegroundColor={props.summary.browserForegroundColor}
            defaultFontSize={props.summary.defaultFontSize}
            dispatch={props.dispatch}
            displayingMultipleMsgs={!!props.messages.length}
            hasBuiltInPdf={props.summary.hasBuiltInPdf}
            hideQuickReply={props.summary.hideQuickReply}
            iframesLoading={props.summary.iframesLoading}
            index={index}
            isLastMessage={index == props.messages.msgData.length - 1}
            message={message}
            tenPxFactor={props.summary.tenPxFactor}
            prefs={props.summary.prefs}
            advanceMessage={(step = 1) => {
              advanceMessage(index, step);
            }}
            setRef={(ref) => {
              setRef(index, ref);
            }}
          />
        ))}
    </ul>
  );
}

_MessageList.propTypes = {
  dispatch: PropTypes.func.isRequired,
  messages: PropTypes.object.isRequired,
  summary: PropTypes.object.isRequired,
};

const MessageList = ReactRedux.connect((state) => {
  return {
    messages: state.messages,
    summary: state.summary,
  };
})(_MessageList);
