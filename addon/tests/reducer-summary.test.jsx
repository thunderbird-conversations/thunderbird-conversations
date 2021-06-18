/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Need to import utils.js to set up the fetch stub.
// eslint-disable-next-line no-unused-vars
import { enzyme } from "./utils.js";
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

function createFakeMessageData({
  id = 1,
  bugzilla = false,
  snippet = "",
  detailsShowing,
} = {}) {
  let data = {
    id,
    bugzilla,
    snippet,
    _contactsData: [],
  };
  if (detailsShowing !== undefined) {
    data.detailsShowing = detailsShowing;
  }
  return data;
}

describe("Summary Reducer and Actions tests", () => {
  describe("updateConversation", () => {
    beforeEach(() => {
      messageActions.updateConversation = jest.fn(() => {
        return { type: "mock" };
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("Adjusts the snippet for better output from bugzilla", async () => {
      const msgSnippets = [
        {
          actual: "My message snippet",
          expected: "My message snippet",
        },
        {
          actual:
            "https://bugzilla.mozilla.org/show_bug.cgi?id=1199577\n\nSausages <sausages@example.com> changed:\n",
          expected: "\n\nSausages <sausages@example.com> changed:\n",
        },
        {
          actual: `https://bugzilla.mozilla.org/show_bug.cgi?id=1712565

Petruta Horea [:phorea] <petruta.rasa@softvision.com> changed:

           What    |Removed                     |Added
----------------------------------------------------------------------------
             Status|RESOLVED                    |VERIFIED
   status-firefox91|fixed                       |verified

--- Comment #5 from Petruta Horea [:phorea] <petruta.rasa@softvision.com> 2021-06-03 11:25:00 BST ---
Updating`,
          expected: "\nUpdating",
        },
      ];
      const fakeMsgs = msgSnippets.map((snippet) =>
        createFakeMessageData({ snippet: snippet.actual })
      );
      await store.dispatch(
        summaryActions.updateConversation({
          messages: {
            msgData: fakeMsgs.map((m) => {
              return { ...m };
            }),
          },
          append: false,
        })
      );

      expect(messageActions.updateConversation).toHaveBeenCalled();
      let msgData =
        messageActions.updateConversation.mock.calls[0][0].messages.msgData;
      for (let [i, fakeMsg] of fakeMsgs.entries()) {
        fakeMsg.detailsShowing = false;
        let expected = createFakeMessageData({
          detailsShowing: false,
          snippet: msgSnippets[i].expected,
        });
        expect(msgData[i]).toStrictEqual(expected);
      }
    });
  });
});
