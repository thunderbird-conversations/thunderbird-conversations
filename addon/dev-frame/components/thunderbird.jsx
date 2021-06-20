/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { useDispatch, useSelector } from "react-redux";
import { devFrameActions } from "../reducer";

function WindowButtons() {
  return (
    <div className="mock-tb-window-buttons-container">
      <div className="mock-tb-close">●</div>
      <div className="mock-tb-maximize">●</div>
      <div className="mock-tb-minimize">●</div>
    </div>
  );
}

function MockThunderbird({ children }) {
  return (
    <div className="mock-tb-frame">
      <div className="mock-tb-toolbar">
        <WindowButtons />
      </div>
      <div className="mock-tb-content">{children}</div>
    </div>
  );
}
MockThunderbird.propTypes = {
  children: PropTypes.element,
};

/**
 * A mock thunderbird UI using the three-panel view.
 *
 * @param {object} root0
 * @param {object} root0.left
 * @param {object} root0.topRight
 * @param {object} root0.bottomRight
 * @returns {object}
 */
export function ThreePanelThunderbird({
  left = null,
  topRight = null,
  bottomRight = null,
}) {
  return (
    <MockThunderbird>
      <div className="three-pane-container">
        <div className="three-pane-left">{left}</div>
        <div className="three-pane-right">
          <div className="three-pane-top">{topRight}</div>
          <div className="three-pane-bottom">{bottomRight}</div>
        </div>
      </div>
    </MockThunderbird>
  );
}
ThreePanelThunderbird.propTypes = {
  left: PropTypes.element,
  topRight: PropTypes.element,
  bottomRight: PropTypes.element,
};

/**
 * Display a message row for the thread view. This component will be indented
 * depending on its position in the thread.
 *
 * @param {object} root0
 * @param {object} root0.message
 * @param {number} root0.position
 * @param {number} root0.numMessages
 * @param {Function} root0.onClick
 * @returns {object}
 */
function MessageRow({
  message,
  position = 0,
  numMessages = 1,
  onClick = () => {},
}) {
  // Is the message the first in a thread of many?
  const isFirst = numMessages > 1 && position === 0;

  const star = message.starred ? (
    <div className="mock-tb-star starred">★</div>
  ) : (
    <div className="mock-tb-star">☆</div>
  );

  // The first message
  const expander = <div className="mock-tb-expander">{isFirst ? "⌄" : ""}</div>;

  let indent = null;
  if (!isFirst && numMessages > 1) {
    // We want to indent once for each message, but in the last one, we
    // put a `└` icon
    indent = [];
    for (let i = 0; i < position - 1; i++) {
      indent.push(<div key={i} className="mock-tb-message-indent" />);
    }
    indent.push(
      <div key={position} className="mock-tb-message-indent">
        └
      </div>
    );
  }

  return (
    <div className="mock-tb-message-row" onClick={() => onClick(position)}>
      {star}
      {expander}
      {indent}
      <div
        className={`mock-tb-message-row-subject ${
          message.read ? "read" : "unread"
        }`}
      >
        {message.subject}
      </div>
    </div>
  );
}
MessageRow.propTypes = {
  message: PropTypes.object.isRequired,
  position: PropTypes.number,
  numMessages: PropTypes.number,
  onClick: PropTypes.func,
};

/**
 * Display a thread of messages, successively indenting each one in the chain.
 *
 * @param {object}root0
 * @param {object[]} root0.thread
 * @param {number} root0.position
 * @returns {React.Fragment}
 */
function Thread({ thread, position = 0 }) {
  const dispatch = useDispatch();

  function onClick(index) {
    dispatch(
      devFrameActions.setActiveThread({
        thread: position,
        message: index,
      })
    );
  }
  return (
    <React.Fragment>
      {thread.map((message, i) => (
        <MessageRow
          key={i}
          message={message}
          position={i}
          numMessages={thread.length}
          onClick={onClick}
        />
      ))}
    </React.Fragment>
  );
}
Thread.propTypes = {
  thread: PropTypes.array.isRequired,
  position: PropTypes.number,
};

/**
 * Display a threaded view of all the threads in `state.threads.threadData`
 * in the Redux store.
 *
 * @returns {React.Fragment}
 */
export function ThreadView() {
  const threads = useSelector((state) => state.threads.threadData);
  return (
    <React.Fragment>
      {threads.map((thread, i) => (
        <Thread key={i} thread={thread} position={i} />
      ))}
    </React.Fragment>
  );
}
