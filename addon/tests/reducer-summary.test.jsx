/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Need to import utils.js to set up the fetch stub.
import { createFakeData } from "./utils.js";
import { jest } from "@jest/globals";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";

// Import the components we want to test
import {
  summarySlice,
  summaryActions,
} from "../content/reducer/reducer-summary.js";
import { messageActions } from "../content/reducer/reducer-messages.js";

const summaryApp = Redux.combineReducers({
  summary: summarySlice.reducer,
});

const store = RTK.configureStore({ reducer: summaryApp });

describe("Summary Reducer and Actions tests", () => {
  let fakeMessageHeaderData;

  beforeEach(() => {
    fakeMessageHeaderData = new Map();
    jest
      .spyOn(browser.messages, "get")
      .mockImplementation(async (id) => fakeMessageHeaderData.get(id));
  });

  describe("updateConversation", () => {
    beforeEach(() => {
      messageActions.updateConversation = jest.fn(() => {
        return { type: "mock" };
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
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
        summaryActions.updateConversation({
          messages: {
            msgData: [fakeMsg],
          },
          append: false,
        })
      );

      expect(messageActions.updateConversation).toHaveBeenCalled();
      let msgData =
        messageActions.updateConversation.mock.calls[0][0].messages.msgData;

      let date = new Intl.DateTimeFormat(undefined, {
        timeStyle: "short",
      }).format(new Date());

      createFakeData(
        {
          detailsShowing: false,
          date: "yesterday",
          fullDate: date,
          snippet: "My message snippet",
        },
        fakeMessageHeaderData
      );
      expect(msgData[0]).toStrictEqual({
        _contactsData: [],
        attachments: [],
        attachmentsPlural: "",
        bugzilla: false,
        date: "yesterday",
        detailsShowing: false,
        folderName: "Fake/Folder",
        fullDate: date,
        id: 0,
        initialPosition: 0,
        isDraft: false,
        isJunk: false,
        isOutbox: false,
        multipleRecipients: false,
        read: false,
        shortFolderName: "Inbox",
        snippet: "My message snippet",
        starred: false,
        subject: "Fake Msg",
        tags: [],
      });
    });
  });
});
