/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { useDispatch, useSelector } from "react-redux";
import { devFrameActions } from "../reducer.js";

function WindowButtons() {
  return React.createElement(
    "div",
    { className: "mock-tb-window-buttons-container" },
    React.createElement("div", { className: "mock-tb-close" }, "●"),
    React.createElement("div", { className: "mock-tb-maximize" }, "●"),
    React.createElement("div", { className: "mock-tb-minimize" }, "●")
  );
}

function MockThunderbird({ children }) {
  return React.createElement(
    "div",
    { className: "mock-tb-frame" },
    React.createElement(
      "div",
      { className: "mock-tb-toolbar" },
      React.createElement(WindowButtons)
    ),
    React.createElement("div", { className: "mock-tb-content" }, children)
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
  return React.createElement(
    MockThunderbird,
    null,
    React.createElement(
      "div",
      { className: "three-pane-container" },
      React.createElement("div", { className: "three-pane-left" }, left),
      React.createElement(
        "div",
        { className: "three-pane-right" },
        React.createElement("div", { className: "three-pane-top" }, topRight),
        React.createElement(
          "div",
          { className: "three-pane-bottom" },
          bottomRight
        )
      )
    )
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

  const star = message.starred
    ? React.createElement("div", { className: "mock-tb-star starred" }, "★")
    : React.createElement("div", { className: "mock-tb-star" }, "☆");

  // The first message
  const expander = React.createElement(
    "div",
    { className: "mock-tb-expander" },
    isFirst ? "⌄" : ""
  );

  let indent = null;
  if (!isFirst && numMessages > 1) {
    // We want to indent once for each message, but in the last one, we
    // put a `└` icon
    indent = [];
    for (let i = 0; i < position - 1; i++) {
      indent.push(
        React.createElement("div", {
          className: "mock-tb-message-indent",
          key: i,
        })
      );
    }
    indent.push(
      React.createElement(
        "div",
        { className: "mock-tb-message-indent", key: position },
        "└"
      )
    );
  }

  return React.createElement(
    "div",
    { className: "mock-tb-message-row", onClick: () => onClick(position) },
    star,
    expander,
    indent,
    React.createElement(
      "div",
      {
        className: `mock-tb-message-row-subject ${
          message.read ? "read" : "unread"
        }`,
      },
      message.subject
    )
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
  return React.createElement(
    React.Fragment,
    "",
    thread.map((message, i) =>
      React.createElement(MessageRow, {
        key: i,
        message: message,
        position: i,
        numMessages: thread.length,
        onClick: onClick,
      })
    )
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
  return React.createElement(
    React.Fragment,
    null,
    threads.map((thread, i) =>
      React.createElement(Thread, { key: i, thread, position: i })
    )
  );
}
