/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";
import { createFakeData } from "./utils.mjs";

import {
  messagesSlice,
  messageActions,
} from "../content/reducer/reducerMessages.mjs";
import { summarySlice } from "../content/reducer/reducerSummary.mjs";

const app = Redux.combineReducers({
  messages: messagesSlice.reducer,
  summary: summarySlice.reducer,
});

const store = RTK.configureStore({ reducer: app });

async function showDetails(showMessageId) {
  store.dispatch(
    summarySlice.actions.setUserPreferences({
      ...store.getState().summary.prefs,
      showMessageId,
    })
  );
  await store.dispatch(
    messageActions.replaceConversation({
      messages: [createFakeData({ asInternal: true, id: 1 }, new Map())],
    })
  );
  await store.dispatch(
    messageActions.showMsgDetails({ id: 1, detailsShowing: true })
  );
  return store.getState().messages.msgData[0].extraLines;
}

describe("Message details", () => {
  beforeEach(
    /** @param {it.TestContext} t */ (t) => {
      t.mock
        .method(browser.messages, "getFull")
        .mock.mockImplementation(async () => ({
          headers: {
            date: ["Mon, 27 Oct 2026 10:00:00 +0100"],
            "message-id": ["<abc.123@example.com>"],
          },
          parts: [{}],
        }));
    }
  );

  it("Hides the Message-ID by default", async () => {
    let lines = await showDetails(false);

    // The other headers are still there.
    assert.ok(
      lines.some((line) => line.value?.[0] == "Mon, 27 Oct 2026 10:00:00 +0100")
    );
    assert.ok(!lines.some((line) => line.key == "message-id"));
  });

  it("Shows the Message-ID when the option is set", async () => {
    let lines = await showDetails(true);

    assert.deepEqual(
      lines.find((line) => line.key == "message-id"),
      { key: "message-id", value: ["<abc.123@example.com>"] }
    );
  });
});
