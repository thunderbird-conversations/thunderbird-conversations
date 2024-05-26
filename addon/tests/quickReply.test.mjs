/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
// eslint-disable-next-line no-shadow
import { render, fireEvent, act, screen } from "@testing-library/react";
import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { conversationApp } from "../content/reducer/reducer.mjs";

// Import the components we want to test
import { QuickReply } from "../content/components/quickreply/quickReply.mjs";
import { quickReplyActions } from "../content/reducer/reducerQuickReply.mjs";

describe("Quick Reply tests", () => {
  let store;

  beforeEach(async (t) => {
    store = RTK.configureStore({
      reducer: conversationApp,
    });
    quickReplyActions.expand = t.mock.fn(() => {
      return {
        type: "expand",
      };
    });
  });

  describe("Expansion Actions", () => {
    it("It should handle only the reply button", async () => {
      render(
        React.createElement(
          ReactRedux.Provider,
          { store },
          React.createElement(QuickReply, {
            id: 0,
            multipleRecipients: false,
            recipientsIncludeLists: false,
          })
        )
      );

      let replyButton = screen.getByRole("button", { name: "reply" });
      assert.equal(screen.queryByRole("button", { name: "reply all" }), null);
      assert.equal(
        screen.queryByRole("button", { name: "reply to list" }),
        null
      );

      fireEvent.click(replyButton);

      assert.equal(quickReplyActions.expand.mock.calls.length, 1);
      assert.deepEqual(quickReplyActions.expand.mock.calls[0].arguments[0], {
        id: 0,
        type: "reply",
      });
    });

    it("It should handle the reply and replyAll button", async () => {
      render(
        React.createElement(
          ReactRedux.Provider,
          { store },
          React.createElement(QuickReply, {
            id: 0,
            multipleRecipients: true,
            recipientsIncludeLists: false,
          })
        )
      );

      assert.notEqual(screen.queryByRole("button", { name: "reply" }), null);
      assert.notEqual(
        screen.queryByRole("button", { name: "reply all" }),
        null
      );
      assert.equal(
        screen.queryByRole("button", { name: "reply to list" }),
        null
      );

      fireEvent.click(screen.getByRole("button", { name: "reply" }));

      assert.equal(quickReplyActions.expand.mock.calls.length, 1);
      assert.deepEqual(quickReplyActions.expand.mock.calls[0].arguments[0], {
        id: 0,
        type: "reply",
      });

      fireEvent.click(screen.getByRole("button", { name: "reply all" }));

      assert.equal(quickReplyActions.expand.mock.calls.length, 2);
      assert.deepEqual(quickReplyActions.expand.mock.calls[1].arguments[0], {
        id: 0,
        type: "replyAll",
      });
    });

    it("It should handle the reply and replyList button", async () => {
      render(
        React.createElement(
          ReactRedux.Provider,
          { store },
          React.createElement(QuickReply, {
            id: 0,
            multipleRecipients: true,
            recipientsIncludeLists: true,
          })
        )
      );

      assert.notEqual(screen.queryByRole("button", { name: "reply" }), null);
      assert.equal(screen.queryByRole("button", { name: "reply all" }), null);
      assert.notEqual(
        screen.queryByRole("button", { name: "reply to list" }),
        null
      );

      fireEvent.click(screen.getByRole("button", { name: "reply" }));

      assert.equal(quickReplyActions.expand.mock.calls.length, 1);
      assert.deepEqual(quickReplyActions.expand.mock.calls[0].arguments[0], {
        id: 0,
        type: "reply",
      });

      fireEvent.click(screen.getByRole("button", { name: "reply to list" }));

      assert.equal(quickReplyActions.expand.mock.calls.length, 2);
      assert.deepEqual(quickReplyActions.expand.mock.calls[1].arguments[0], {
        id: 0,
        type: "replyList",
      });
    });
  });

  describe("Expanded state", () => {
    it("Should show the ComposeWidget when expanded", async () => {
      render(
        React.createElement(
          ReactRedux.Provider,
          { store },
          React.createElement(QuickReply, {
            id: 0,
            multipleRecipients: false,
            recipientsIncludeLists: false,
          })
        )
      );

      await act(() => {
        return store.dispatch(
          quickReplyActions.setExpandedState({ expanded: true })
        );
      });

      assert.equal(screen.queryByRole("button", { name: "reply" }), null);
      assert.equal(screen.queryByRole("button", { name: "reply all" }), null);
      assert.equal(
        screen.queryByRole("button", { name: "reply to list" }),
        null
      );

      assert.notEqual(screen.queryByRole("textbox", { name: "to:" }), null);
    });
  });
});
