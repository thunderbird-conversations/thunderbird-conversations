/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Need to import utils.js to set up the fetch stub.
import { createFakeData, createFakeSummaryData } from "./utils.js";
import { jest } from "@jest/globals";
import { browser } from "../content/es-modules/thunderbird-compat.js";
import { messageEnricher } from "../content/reducer/messages.js";

describe("messageEnricher", () => {
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

  describe("Header Details", () => {
    test("Fills out the message with details from the header", async () => {
      let fakeMsg = createFakeData({}, fakeMessageHeaderData);

      await messageEnricher.enrich(
        [fakeMsg],
        createFakeSummaryData({ noFriendlyDate: true })
      );

      expect(fakeMsg).toMatchObject({
        isDraft: false,
        isJunk: false,
        isOutbox: false,
        read: false,
        shortFolderName: "Inbox",
        folderName: "Fake/Folder",
        subject: "Fake Msg",
        starred: false,
        tags: [],
      });
    });

    test("Correctly sets flags with details from the header", async () => {
      let tests = [
        {
          source: {
            id: 1,
            folderType: "drafts",
            folderName: "Drafts",
            read: true,
            subject: "A draft",
            flagged: true,
          },
          expected: {
            isDraft: true,
            isJunk: false,
            isOutbox: false,
            read: true,
            shortFolderName: "Drafts",
            folderName: "Fake/Folder",
            subject: "A draft",
            starred: true,
            tags: [],
          },
        },
        {
          source: {
            id: 2,
            folderType: "outbox",
            folderName: "Outbox",
          },
          expected: {
            isDraft: false,
            isJunk: false,
            isOutbox: true,
            shortFolderName: "Outbox",
          },
        },
        {
          source: {
            id: 3,
            folderType: "inbox",
            junk: true,
          },
          expected: {
            isDraft: false,
            isJunk: true,
            isOutbox: false,
          },
        },
      ];

      for (let test of tests) {
        let fakeMsg = createFakeData(test.source, fakeMessageHeaderData);

        await messageEnricher.enrich(
          [fakeMsg],
          createFakeSummaryData({ noFriendlyDate: true })
        );

        expect(fakeMsg).toMatchObject(test.expected);
      }
    });

    test("Obtains the informaiton for tags", async () => {
      let fakeMsg = createFakeData(
        {
          tags: ["$label1", "$label3"],
        },
        fakeMessageHeaderData
      );

      await messageEnricher.enrich(
        [fakeMsg],
        createFakeSummaryData({ noFriendlyDate: true })
      );

      expect(fakeMsg).toMatchObject({
        tags: [
          {
            color: "#ff2600",
            key: "$label1",
            name: "Important",
          },
          {
            color: "#009900",
            key: "$label3",
            name: "Personal",
          },
        ],
      });
    });
  });

  describe("Attachments", () => {
    test("Extends the information for attachments", async () => {
      let fakeMsg = createFakeData(
        {
          attachments: [
            {
              contentType: "application/pdf",
              isExternal: false,
              name: "foo.pdf",
              partName: "1.2",
              size: 634031,
              url: "imap://fakeurl",
            },
          ],
        },
        fakeMessageHeaderData
      );

      await messageEnricher.enrich(
        [fakeMsg],
        createFakeSummaryData({ noFriendlyDate: true })
      );

      expect(fakeMsg).toMatchObject({
        attachments: [
          {
            anchor: "msg0att0",
            contentType: "application/pdf",
            formattedSize: "634031 bars",
            isExternal: false,
            name: "foo.pdf",
            partName: "1.2",
            size: 634031,
            url: "imap://fakeurl",
          },
        ],
      });
    });
  });

  describe("Snippets", () => {
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
      const fakeMsgs = msgSnippets.map((snippet, index) =>
        createFakeData(
          {
            id: index + 1,
            snippet: snippet.actual,
          },
          fakeMessageHeaderData
        )
      );
      await messageEnricher.enrich(fakeMsgs, createFakeSummaryData());

      for (let [i, fakeMsg] of fakeMsgs.entries()) {
        expect(fakeMsg.snippet).toBe(msgSnippets[i].expected);
      }
    });
  });

  describe("Dates", () => {
    test("Sets the dates for displaying friendly dates", async () => {
      let now = Date.now();
      let fakeMsg = createFakeData({ date: now }, fakeMessageHeaderData);

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
      let fakeMsg = createFakeData({ date: now }, fakeMessageHeaderData);

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
