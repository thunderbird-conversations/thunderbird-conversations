/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { createFakeData, createFakeSummaryData } from "./utils.mjs";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";

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

  beforeEach((t) => {
    fakeMessageHeaderData = new Map();
    t.mock
      .method(browser.messages, "get")
      .mock.mockImplementation(async (id) => fakeMessageHeaderData.get(id));
  });

  describe("displayConversationMsgs", () => {
    let oldReplaceConversation;

    beforeEach((t) => {
      // TODO: Figure out how to mock this properly.
      oldReplaceConversation = messageActions.replaceConversation;
      messageActions.replaceConversation = t.mock.fn(() => {
        return { type: "mock" };
      });
    });

    afterEach(() => {
      messageActions.replaceConversation = oldReplaceConversation;
    });

    it("Enriches message data", async () => {
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

      assert.equal(messageActions.replaceConversation.mock.calls.length, 1);
      let msgData =
        messageActions.replaceConversation.mock.calls[0].arguments[0].messages;

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

      assert.deepEqual(msgData[0], {
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
        parsedLines: {
          alternativeSender: [],
          bcc: [],
          cc: [],
          from: [],
          to: [],
        },
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

    it("Appends message data", async () => {
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
      assert.equal(msgs.length, 2);
      assert.equal(msgs[1].id, 2);
    });

    it("Expands all appended messages when expand is set to all", async () => {
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
        assert.equal(msgs[i].expanded, true);
        assert.equal("scrollTo" in msgs[i], false);
      }
    });

    it("Expands no appended messages when expand is set to none", async () => {
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
        assert.equal(msgs[i].expanded, false);
        assert.equal("scrollTo" in msgs[i], false);
      }
    });
  });
});
