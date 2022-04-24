/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent, act, screen } from "@testing-library/react";
import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { jest } from "@jest/globals";
import { conversationApp } from "../content/reducer/reducer.js";

// Import the components we want to test
import { QuickReply } from "../content/components/quickreply/quickReply.jsx";
import { quickReplyActions } from "../content/reducer/reducerQuickReply.js";

describe("Quick Reply tests", () => {
  let store;

  beforeEach(async () => {
    store = RTK.configureStore({
      reducer: conversationApp,
      middleware: RTK.getDefaultMiddleware(),
    });
    quickReplyActions.expand = jest.fn().mockImplementation(() => {
      return {
        type: "expand",
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Expansion Actions", () => {
    test("It should handle only the reply button", async () => {
      render(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={false}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      let replyButton = screen.getByRole("button", { name: "reply" });
      expect(screen.queryByRole("button", { name: "reply all" })).toBe(null);
      expect(screen.queryByRole("button", { name: "reply to list" })).toBe(
        null
      );

      fireEvent.click(replyButton);

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });
    });

    test("It should handle the reply and replyAll button", async () => {
      render(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={true}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      expect(screen.queryByRole("button", { name: "reply" })).not.toBe(null);
      expect(screen.queryByRole("button", { name: "reply all" })).not.toBe(
        null
      );
      expect(screen.queryByRole("button", { name: "reply to list" })).toBe(
        null
      );

      fireEvent.click(screen.getByRole("button", { name: "reply" }));

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });

      fireEvent.click(screen.getByRole("button", { name: "reply all" }));

      expect(quickReplyActions.expand.mock.calls.length).toBe(2);
      expect(quickReplyActions.expand.mock.calls[1][0]).toStrictEqual({
        id: 0,
        type: "replyAll",
      });
    });

    test("It should handle the reply and replyList button", async () => {
      render(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={true}
            recipientsIncludeLists={true}
          />
        </ReactRedux.Provider>
      );

      expect(screen.queryByRole("button", { name: "reply" })).not.toBe(null);
      expect(screen.queryByRole("button", { name: "reply all" })).toBe(null);
      expect(screen.queryByRole("button", { name: "reply to list" })).not.toBe(
        null
      );

      fireEvent.click(screen.getByRole("button", { name: "reply" }));

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });

      fireEvent.click(screen.getByRole("button", { name: "reply to list" }));

      expect(quickReplyActions.expand.mock.calls.length).toBe(2);
      expect(quickReplyActions.expand.mock.calls[1][0]).toStrictEqual({
        id: 0,
        type: "replyList",
      });
    });
  });

  describe("Expanded state", () => {
    test("Should show the ComposeWidget when expanded", async () => {
      render(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={false}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      await act(() => {
        return store.dispatch(
          quickReplyActions.setExpandedState({ expanded: true })
        );
      });

      expect(screen.queryByRole("button", { name: "reply" })).toBe(null);
      expect(screen.queryByRole("button", { name: "reply all" })).toBe(null);
      expect(screen.queryByRole("button", { name: "reply to list" })).toBe(
        null
      );

      expect(screen.queryByRole("textbox", { name: "to:" })).not.toBe(null);
    });
  });
});
