/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { Message } from "./message.jsx";

/**
 * Handles display of the list of messages.
 *
 * @param {object} props
 */
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
            hideQuickReply={props.summary.prefs.hideQuickReply}
            iframesLoading={props.summary.iframesLoading}
            index={index}
            isInTab={props.summary.isInTab}
            isLastMessage={index == props.messages.msgData.length - 1}
            isStandalone={props.summary.isStandalone}
            message={message}
            tenPxFactor={props.summary.tenPxFactor}
            prefs={props.summary.prefs}
            advanceMessage={(step = 1) => {
              advanceMessage(index, step);
            }}
            setRef={(ref) => {
              setRef(index, ref);
            }}
            tabId={props.summary.tabId}
            winId={props.summary.winId}
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

export const MessageList = ReactRedux.connect((state) => {
  return {
    messages: state.messages,
    summary: state.summary,
  };
})(_MessageList);
