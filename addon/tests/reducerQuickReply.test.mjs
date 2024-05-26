/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { jest } from "@jest/globals";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";
import { createFakeData } from "./utils.mjs";

// Import the components we want to test
import {
  quickReplySlice,
  quickReplyActions,
} from "../content/reducer/reducerQuickReply.mjs";
import {
  messagesSlice,
  messageActions,
} from "../content/reducer/reducerMessages.mjs";
import { composeActions } from "../content/reducer/reducerCompose.mjs";

const quickReplyApp = Redux.combineReducers({
  quickReply: quickReplySlice.reducer,
  messages: messagesSlice.reducer,
});

const store = RTK.configureStore({ reducer: quickReplyApp });

let fakeMessageHeaderData;

async function createAndSetMessage(data) {
  let fakeMsg = createFakeData(
    { asInternal: true, id: 1, ...data },
    fakeMessageHeaderData
  );
  await store.dispatch(
    messageActions.replaceConversation({
      messages: [fakeMsg],
    })
  );
}

describe("QuickReply Reducer and Actions tests", () => {
  beforeEach(() => {
    fakeMessageHeaderData = new Map();
    jest
      .spyOn(browser.messages, "get")
      .mockImplementation(async (id) => fakeMessageHeaderData.get(id));

    composeActions.initCompose = jest.fn().mockImplementation(() => {
      return {
        type: "initCompose",
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("expand", () => {
    describe("Reply", () => {
      test("Should set the to address based on the author", async () => {
        await createAndSetMessage({ author: "me@example.com" });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "reply" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          to: "me@example.com",
        });
      });

      test("Should use the receipent address if the author address is an identity", async () => {
        await createAndSetMessage({
          author: "id5@example.com",
          to: { email: "other@example.com" },
        });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "reply" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          to: "other@example.com",
        });
      });

      test("Should use the reply-to address if the header is set", async () => {
        jest
          .spyOn(browser.messages, "getFull")
          .mockImplementation(async (id) => {
            return {
              headers: { "reply-to": ["reply-to@example.com"] },
              parts: [{}],
            };
          });

        await createAndSetMessage({
          author: "me@example.com",
          headers: [{ "reply-to": "reply-to@example.com" }],
        });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "reply" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          to: "reply-to@example.com",
        });
      });
    });

    describe("Reply All", () => {
      test("Should set the to address based on the author and receipients", async () => {
        await createAndSetMessage({
          author: "me@example.com",
          to: { email: "to@example.com" },
          ccList: ["cc1@example.com", "cc2@example.com"],
          bccList: ["bcc@example.com"],
        });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "replyAll" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          // TODO: bcc should be in the bcc field (probably ditto with cc).
          to: "me@example.com, to@example.com, cc1@example.com, cc2@example.com, bcc@example.com",
        });
      });

      test("Should exclude the identity email address", async () => {
        await createAndSetMessage({
          author: "me@example.com",
          to: [{ email: "to@example.com" }, { email: "id5@example.com" }],
        });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "replyAll" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          // TODO: bcc should be in the bcc field (probably ditto with cc).
          to: "me@example.com, to@example.com",
        });
      });

      test("Should include the reply-to address", async () => {
        jest
          .spyOn(browser.messages, "getFull")
          .mockImplementation(async (id) => {
            return {
              headers: { "reply-to": ["reply-to@example.com"] },
              parts: [{}],
            };
          });

        await createAndSetMessage({
          author: "me@example.com",
          to: { email: "other@example.com" },
        });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "replyAll" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          to: "reply-to@example.com, me@example.com, other@example.com",
        });
      });
    });

    test("Should set the expanded state.", async () => {
      let fakeMsg = createFakeData(
        { asInternal: true, id: 1, author: "me@example.com" },
        fakeMessageHeaderData
      );
      await store.dispatch(
        messageActions.replaceConversation({
          messages: [fakeMsg],
        })
      );

      await store.dispatch(
        quickReplyActions.expand({ id: 1, type: "replyAll" })
      );

      expect(store.getState().quickReply).toMatchObject({
        expanded: true,
      });
    });

    describe("Reply List", () => {
      test("Should reply to a list", async () => {
        jest
          .spyOn(browser.messages, "getFull")
          .mockImplementation(async (id) => {
            return {
              headers: { "list-post": ["<mailto:list@example.com>"] },
              parts: [{}],
            };
          });

        await createAndSetMessage({ author: "me@example.com" });

        await store.dispatch(
          quickReplyActions.expand({ id: 1, type: "replyList" })
        );

        expect(composeActions.initCompose.mock.calls.length).toBe(1);
        expect(composeActions.initCompose.mock.calls[0][0]).toMatchObject({
          to: "list@example.com",
        });
      });
    });
  });

  describe("discard", () => {
    test("Should clear the expanded state.", async () => {
      await store.dispatch(
        quickReplySlice.actions.setExpandedState({ expanded: true })
      );

      await store.dispatch(quickReplyActions.discard());

      expect(store.getState().quickReply).toMatchObject({
        expanded: false,
      });
    });
  });
});
