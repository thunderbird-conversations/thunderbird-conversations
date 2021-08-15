/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { enzyme, waitForComponentToPaint } from "./utils.js";
import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { jest } from "@jest/globals";
import { conversationApp } from "../content/reducer/reducer.js";

// Import the components we want to test
import { QuickReply } from "../content/components/quickReply/quickReply.jsx";
import { ComposeWidget } from "../content/components/compose/composeWidget.jsx";
import { quickReplyActions } from "../content/reducer/reducer-quickReply.js";

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
      let main = enzyme.mount(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={false}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      await waitForComponentToPaint(main);

      let replyButton = main.find(".reply");
      expect(replyButton.exists()).toBe(true);
      expect(main.find("replyAll").exists()).toBe(false);
      expect(main.find("replyList").exists()).toBe(false);

      replyButton.simulate("click");

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });
    });

    test("It should handle the reply and replyAll button", async () => {
      let main = enzyme.mount(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={true}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      await waitForComponentToPaint(main);

      let replyButton = main.find(".reply");
      let replyAllButton = main.find(".replyAll");
      expect(replyButton.exists()).toBe(true);
      expect(replyAllButton.exists()).toBe(true);
      expect(main.find("replyList").exists()).toBe(false);

      replyButton.simulate("click");

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });

      replyAllButton.simulate("click");

      expect(quickReplyActions.expand.mock.calls.length).toBe(2);
      expect(quickReplyActions.expand.mock.calls[1][0]).toStrictEqual({
        id: 0,
        type: "replyAll",
      });
    });

    test("It should handle the reply and replyList button", async () => {
      let main = enzyme.mount(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={true}
            recipientsIncludeLists={true}
          />
        </ReactRedux.Provider>
      );

      await waitForComponentToPaint(main);

      let replyButton = main.find(".reply");
      let replyListButton = main.find(".replyList");
      expect(replyButton.exists()).toBe(true);
      expect(main.find("replyAll").exists()).toBe(false);
      expect(replyListButton.exists()).toBe(true);

      replyButton.simulate("click");

      expect(quickReplyActions.expand.mock.calls.length).toBe(1);
      expect(quickReplyActions.expand.mock.calls[0][0]).toStrictEqual({
        id: 0,
        type: "reply",
      });

      replyListButton.simulate("click");

      expect(quickReplyActions.expand.mock.calls.length).toBe(2);
      expect(quickReplyActions.expand.mock.calls[1][0]).toStrictEqual({
        id: 0,
        type: "replyList",
      });
    });
  });

  describe("Expanded state", () => {
    test("Should show the ComposeWidget when expanded", async () => {
      let main = enzyme.mount(
        <ReactRedux.Provider store={store}>
          <QuickReply
            id={0}
            multipleRecipients={false}
            recipientsIncludeLists={false}
          />
        </ReactRedux.Provider>
      );

      await waitForComponentToPaint(main);

      await store.dispatch(
        quickReplyActions.setExpandedState({ expanded: true })
      );

      await waitForComponentToPaint(main);

      expect(main.find("reply").exists()).toBe(false);
      expect(main.find("replyAll").exists()).toBe(false);
      expect(main.find("replyList").exists()).toBe(false);
      expect(main.find(ComposeWidget).exists()).toBe(true);
    });
  });
});
