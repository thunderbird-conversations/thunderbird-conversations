/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";

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

describe("Message Actions tests", () => {
  describe("deleteConversation", () => {
    let store;

    beforeEach(() => {
      // A fresh store per test: `isInTab` and the preferences set below would
      // otherwise leak from one case into the next.
      store = RTK.configureStore({ reducer: summaryApp });
    });

    it("deletes the displayed messages as a user action", async (t) => {
      let mockedDelete = t.mock.method(
        browser.messages,
        "delete",
        async () => {}
      );

      store.dispatch(
        summaryActions.setConversationState({
          isInTab: false,
          isStandalone: false,
          isVerticalLayout: false,
          tabId: 7,
          windowId: 8,
        })
      );
      store.dispatch(
        summarySlice.actions.setUserPreferences({
          operateOnConversations: false,
        })
      );

      // With neither `isInTab` nor `operateOnConversations`, the ids come from
      // `browser.messageDisplay.getDisplayedMessages`.
      await store.dispatch(messageActions.deleteConversation());

      assert.equal(mockedDelete.mock.calls.length, 1);
      assert.deepEqual(mockedDelete.mock.calls[0].arguments[0], [123456]);
      assert.equal(mockedDelete.mock.calls[0].arguments[1].isUserAction, true);
      assert.notEqual(
        mockedDelete.mock.calls[0].arguments[1].deletePermanently,
        true
      );
    });

    it("waits for the deletion before closing the tab", async (t) => {
      /** @type {(value?: unknown) => void} */
      let resolveDelete = () => {};
      let mockedDelete = t.mock.method(
        browser.messages,
        "delete",
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );
      let mockedQuery = t.mock.method(browser.tabs, "query", async () => [
        { id: 42 },
      ]);
      let mockedRemove = t.mock.method(browser.tabs, "remove", async () => {});

      store.dispatch(
        summaryActions.setConversationState({
          isInTab: true,
          isStandalone: false,
          isVerticalLayout: false,
          tabId: 42,
          windowId: 8,
        })
      );
      store.dispatch(
        summarySlice.actions.setUserPreferences({
          operateOnConversations: false,
        })
      );
      store.dispatch(
        messagesSlice.actions.replaceConversation({
          messages: [{ id: 123456 }, { id: 123457 }],
        })
      );

      // Deliberately not awaited: the point of this test is what happens while
      // the deletion is still in flight.
      let dispatched = store.dispatch(messageActions.deleteConversation());

      // Let every already-queued microtask run. If `deleteConversation` did
      // not await the deletion, the tab would be gone by now.
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      assert.equal(mockedDelete.mock.calls.length, 1);
      assert.deepEqual(
        mockedDelete.mock.calls[0].arguments[0],
        [123456, 123457]
      );
      assert.equal(mockedDelete.mock.calls[0].arguments[1].isUserAction, true);
      assert.notEqual(
        mockedDelete.mock.calls[0].arguments[1].deletePermanently,
        true
      );
      assert.equal(
        mockedRemove.mock.calls.length,
        0,
        "should not close the tab until the deletion has finished"
      );

      resolveDelete();
      await dispatched;

      assert.equal(mockedQuery.mock.calls.length, 1);
      assert.equal(mockedQuery.mock.calls[0].arguments[0].windowId, 8);
      assert.equal(mockedRemove.mock.calls.length, 1);
      assert.equal(mockedRemove.mock.calls[0].arguments[0], 42);
    });
  });
});
