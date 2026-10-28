/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { mergeContactDetails } from "../content/reducer/contacts.mjs";

describe("mergeContactDetails", () => {
  beforeEach(
    /** @param {it.TestContext} t */ (t) => {
      // Treat me@example.com as one of the user's identities.
      t.mock.method(browser.runtime, "connect").mock.mockImplementation(() => ({
        disconnect() {},
        onMessage: {
          listener: null,
          addListener(l) {
            this.listener = l;
          },
          removeListener() {
            this.listener = null;
          },
        },
        async postMessage(msg) {
          this.onMessage.listener({
            type: "contactDetails",
            for: msg.payload.email,
            contact:
              msg.payload.email == "me@example.com"
                ? { identityId: "id1" }
                : {},
          });
        },
      }));
    }
  );

  function createMsgs() {
    return [
      {
        parsedLines: {
          from: [{ email: "me@example.com", name: "My Name" }],
          to: [{ email: "you@example.com", name: "Your Name" }],
        },
      },
      {
        parsedLines: {
          from: [{ email: "you@example.com", name: "Your Name" }],
          to: [{ email: "me@example.com", name: "My Name" }],
        },
      },
    ];
  }

  it("Shows Me for the user's own identities by default", async () => {
    let msgs = createMsgs();
    await mergeContactDetails(msgs);

    assert.equal(msgs[0].from.name, "Me");
    assert.equal(msgs[0].to[0].name, "Your Name");
    assert.equal(msgs[1].from.name, "Your Name");
    assert.equal(msgs[1].to[0].name, "Me");
  });

  it("Shows the user's own name when showOwnName is set", async () => {
    let msgs = createMsgs();
    await mergeContactDetails(msgs, true);

    assert.equal(msgs[0].from.name, "My Name");
    assert.equal(msgs[0].from.initials, "MN");
    assert.equal(msgs[0].from.displayEmail, "me@example.com");
    assert.equal(msgs[0].from.identityId, "id1");
    assert.equal(msgs[1].to[0].name, "My Name");
  });
});
