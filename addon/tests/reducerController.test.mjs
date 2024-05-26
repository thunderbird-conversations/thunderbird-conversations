/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createFakeData, createFakeSummaryData } from "./utils.mjs";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";

// Import the components we want to test
// jest.mock("../content/reducer/reducerMessages.mjs");

import { conversationActions } from "../content/reducer/reducerConversation.mjs";
import {
  messageActions,
  messagesSlice,
} from "../content/reducer/reducerMessages.mjs";
import {
  summarySlice,
  summaryActions,
} from "../content/reducer/reducerSummary.mjs";

const summaryApp = Redux.combineReducers({
  messages: messagesSlice.reducer,
  summary: summarySlice.reducer,
});

const store = RTK.configureStore({ reducer: summaryApp });

describe("Controller Actions tests", () => {
  let fakeMessageHeaderData;

  beforeEach(() => {
    fakeMessageHeaderData = new Map();
    jest
      .spyOn(browser.messages, "get")
      .mockImplementation(async (id) => fakeMessageHeaderData.get(id));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("displayConversationMsgs", () => {
    let oldReplaceConversation;

    beforeEach(() => {
      // TODO: Figure out how to mock this properly with JEST.
      oldReplaceConversation = messageActions.replaceConversation;
      messageActions.replaceConversation = jest.fn(() => {
        return { type: "mock" };
      });
    });

    afterEach(() => {
      messageActions.replaceConversation = oldReplaceConversation;
    });

    test("Enriches message data", async () => {
      let now = new Date();
      let fakeMsg = createFakeData(
        {
          date: now,
          snippet: "My message snippet",
        },
        fakeMessageHeaderData
      );
      await store.dispatch(
        conversationActions.displayConversationMsgs({
          msgs: [fakeMsg],
          initialSet: [fakeMsg.id],
          loadingStartedTime: Date.now(),
        })
      );

      expect(messageActions.replaceConversation).toHaveBeenCalled();
      let msgData =
        messageActions.replaceConversation.mock.calls[0][0].messages;

      let date = new Intl.DateTimeFormat(undefined, {
        timeStyle: "short",
      }).format(now);

      createFakeData(
        {
          detailsShowing: false,
          snippet: "My message snippet",
        },
        fakeMessageHeaderData
      );

      // jest doesn't seem to work properly with an object within an array, and
      // we don't need to test for _contactsData anyway as that is more internal.
      delete msgData[0].parsedLines;

      expect(msgData[0]).toStrictEqual({
        alternativeSender: [],
        attachments: [],
        bcc: [],
        attachmentsPlural: "",
        cc: [],
        date: "yesterday",
        detailsShowing: false,
        expanded: true,
        folderAccountId: "id1",
        folderName: "Fake/Inbox",
        folderPath: "Inbox",
        from: undefined,
        fullDate: date,
        hasRemoteContent: false,
        headerMessageId: 0,
        id: 0,
        initialPosition: 0,
        inView: true,
        isArchives: false,
        isDraft: false,
        isInbox: true,
        isJunk: false,
        isOutbox: false,
        isPhishing: false,
        isSent: false,
        isTemplate: false,
        multipleRecipients: false,
        needsLateAttachments: undefined,
        rawDate: now.getTime(),
        read: false,
        realFrom: undefined,
        recipientsIncludeLists: false,
        scrollTo: true,
        shortFolderName: "Inbox",
        smimeReload: false,
        snippet: "My message snippet",
        starred: false,
        subject: "Fake Msg",
        tags: [],
        to: [],
        type: "normal",
      });
    });
  });

  describe("addConversationMsgs", () => {
    beforeEach(async () => {
      let now = new Date();
      let fakeMsg = createFakeData(
        {
          date: now,
          snippet: "My message snippet",
        },
        fakeMessageHeaderData
      );
      await store.dispatch(
        conversationActions.displayConversationMsgs({
          msgs: [fakeMsg],
          initialSet: [fakeMsg.id],
          loadingStartedTime: Date.now(),
        })
      );
    });

    test("Appends message data", async () => {
      let msgs = store.getState().messages.msgData;
      let fakeMsg = createFakeData(
        {
          id: 2,
        },
        fakeMessageHeaderData
      );
      await store.dispatch(
        conversationActions.addConversationMsgs({
          msgs: [fakeMsg],
        })
      );

      msgs = store.getState().messages.msgData;
      expect(msgs.length).toBe(2);
      expect(msgs[1].id).toBe(2);
    });

    test("Expands all appended messages when expand is set to all", async () => {
      let fakeMsgs = [];
      for (let i = 1; i < 5; i++) {
        fakeMsgs.push(createFakeData({ id: i }, fakeMessageHeaderData));
      }

      await store.dispatch(
        summaryActions.setUserPreferences(
          createFakeSummaryData({ expandWho: 4 }).prefs
        )
      );
      await store.dispatch(
        conversationActions.addConversationMsgs({
          msgs: fakeMsgs,
        })
      );

      let msgs = store.getState().messages.msgData;
      for (let i = 1; i < 5; i++) {
        expect(msgs[i].expanded).toBe(true);
        expect("scrollTo" in msgs[i]).toBe(false);
      }
    });

    test("Expands no appended messages when expand is set to none", async () => {
      let fakeMsgs = [];
      for (let i = 1; i < 5; i++) {
        fakeMsgs.push(createFakeData({ id: i }, fakeMessageHeaderData));
      }

      await store.dispatch(
        summaryActions.setUserPreferences(
          createFakeSummaryData({ expandWho: 1 }).prefs
        )
      );
      await store.dispatch(
        conversationActions.addConversationMsgs({
          msgs: fakeMsgs,
        })
      );

      let msgs = store.getState().messages.msgData;
      for (let i = 1; i < 5; i++) {
        expect(msgs[i].expanded).toBe(false);
        expect("scrollTo" in msgs[i]).toBe(false);
      }
    });
  });
});
