/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Need to import utils.js to set up the fetch stub.
// eslint-disable-next-line no-unused-vars
import { enzyme } from "./utils.js";
import { jest } from "@jest/globals";
import { messageEnricher } from "../content/reducer/messages.js";

function createFakeMessageData({
  id = 1,
  bugzilla = false,
  snippet = "",
  detailsShowing,
} = {}) {
  let data = {
    id,
    bugzilla,
    date: Date.now(),
    snippet,
    _contactsData: [],
  };
  if (detailsShowing !== undefined) {
    data.detailsShowing = detailsShowing;
  }
  return data;
}

function createFakeSummaryData(options) {
  return {
    noFriendlyDate: false,
    ...options,
  };
}

describe("messageEnricher", () => {
  describe("snippets", () => {
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
      await messageEnricher.enrich(fakeMsgs, createFakeSummaryData());

      for (let [i, fakeMsg] of fakeMsgs.entries()) {
        expect(fakeMsg.snippet).toBe(msgSnippets[i].expected);
      }
    });
  });

  describe("dates", () => {
    test("Sets the dates for displaying friendly dates", async () => {
      let now = Date.now();
      let fakeMsg = createFakeMessageData({ date: now });

      await messageEnricher.enrich([fakeMsg], createFakeSummaryData());

      expect(fakeMsg.date).toBe("yesterday");
      expect(fakeMsg.fullDate).toBe(
        new Intl.DateTimeFormat(undefined, {
          timeStyle: "short",
        }).format(now)
      );
    });

    test("Sets the dates for not displaying friendly dates", async () => {
      let now = Date.now();
      let fakeMsg = createFakeMessageData({ date: now });

      await messageEnricher.enrich(
        [fakeMsg],
        createFakeSummaryData({ noFriendlyDate: true })
      );

      expect(fakeMsg.date).toBe(
        new Intl.DateTimeFormat(undefined, {
          timeStyle: "short",
        }).format(now)
      );
      expect(fakeMsg.fullDate).toBe("");
    });
  });
});
