/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
// eslint-disable-next-line no-shadow
import { render, screen } from "@testing-library/react";
import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { MessageList } from "../content/components/message/messageList.mjs";
import { Message } from "../content/components/message/message.mjs";
import { conversationApp } from "../content/reducer/reducer.mjs";
import { messageActions } from "../content/reducer/reducerMessages.mjs";
import { summaryActions } from "../content/reducer/reducerSummary.mjs";

function stubMessageRendering(t) {
  const originalRender = Message.prototype.render;
  const originalDidMount = Message.prototype.componentDidMount;
  const originalDidUpdate = Message.prototype.componentDidUpdate;
  const originalWillUnmount = Message.prototype.componentWillUnmount;

  t.after(() => {
    Message.prototype.render = originalRender;
    Message.prototype.componentDidMount = originalDidMount;
    Message.prototype.componentDidUpdate = originalDidUpdate;
    Message.prototype.componentWillUnmount = originalWillUnmount;
  });

  Message.prototype.render = function () {
    return React.createElement(
      "li",
      { "data-testid": "message-item" },
      React.createElement("span", { "data-testid": "message-id" }, this.props.message.id),
      this.props.isLastMessage &&
        React.createElement(
          "span",
          { "data-testid": "quick-reply-target" },
          this.props.message.id
        )
    );
  };
  Message.prototype.componentDidMount = () => {};
  Message.prototype.componentDidUpdate = () => {};
  Message.prototype.componentWillUnmount = () => {};
}

function createStoreWithConversation() {
  const store = RTK.configureStore({
    reducer: conversationApp,
  });

  store.dispatch(
    messageActions.replaceConversation({
      messages: [
        { id: 1, date: 1 },
        { id: 2, date: 2 },
        { id: 3, date: 3 },
      ],
    })
  );

  return store;
}

function renderMessageList(store) {
  render(
    React.createElement(
      ReactRedux.Provider,
      { store },
      React.createElement(MessageList)
    )
  );
}

describe("MessageList", () => {
  it("keeps chronological order by default", async (t) => {
    stubMessageRendering(t);

    const store = createStoreWithConversation();
    renderMessageList(store);

    assert.deepEqual(
      screen.getAllByTestId("message-id").map((item) => Number(item.textContent)),
      [1, 2, 3]
    );
    assert.equal(Number(screen.getByTestId("quick-reply-target").textContent), 3);
  });

  it("renders newest first and keeps quick reply on the newest message when reverse order is enabled", async (t) => {
    stubMessageRendering(t);

    const store = createStoreWithConversation();
    store.dispatch(
      summaryActions.setUserPreferences({
        reverseConversationOrder: true,
      })
    );

    renderMessageList(store);

    assert.deepEqual(
      screen.getAllByTestId("message-id").map((item) => Number(item.textContent)),
      [3, 2, 1]
    );
    assert.equal(Number(screen.getByTestId("quick-reply-target").textContent), 3);
  });
});
