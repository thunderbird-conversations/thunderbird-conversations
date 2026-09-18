/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { MessageEnricher } from "../content/reducer/messageEnricher.mjs";

const kExpandAuto = 4;

describe("MessageEnricher newestFirst preference", () => {
  let enricher;

  beforeEach(() => {
    enricher = new MessageEnricher();
  });

  function makeMsgs(count) {
    let msgs = [];
    for (let i = 0; i < count; i++) {
      msgs.push({
        id: i,
        read: true,
        headerMessageId: `id${i}`,
        scrollTo: false,
        expanded: false,
      });
    }
    return msgs;
  }

  it("scrolls to the last message when newestFirst is not set (default)", () => {
    let msgs = makeMsgs(3);
    enricher._expandAndScroll(msgs, [0, 1, 2], kExpandAuto);
    assert.equal(msgs[2].scrollTo, true);
    assert.equal(!!msgs[0].scrollTo, false);
  });

  it("scrolls to the first message when newestFirst is set", () => {
    let msgs = makeMsgs(3);
    enricher._expandAndScroll(msgs, [0, 1, 2], kExpandAuto, true);
    assert.equal(msgs[0].scrollTo, true);
    assert.equal(!!msgs[2].scrollTo, false);
  });

  it("expands the last message (+ unread) when newestFirst is not set", () => {
    let msgs = makeMsgs(3);
    msgs[0].read = false;
    enricher._markMsgsToExpand(msgs, [0, 1, 2], 2, kExpandAuto);
    assert.deepEqual(
      msgs.map((m) => m.expanded),
      [true, false, true]
    );
  });

  it("expands the first message (+ unread) when newestFirst is set", () => {
    let msgs = makeMsgs(3);
    msgs[2].read = false;
    enricher._markMsgsToExpand(msgs, [0, 1, 2], 0, kExpandAuto, true);
    assert.deepEqual(
      msgs.map((m) => m.expanded),
      [true, false, true]
    );
  });
});
