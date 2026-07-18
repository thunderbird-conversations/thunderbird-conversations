/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { messageUtils } from "../content/reducer/messageUtils.mjs";

describe("getBestIdentityForReply", () => {
  let msg;
  beforeEach(() => {
    messageUtils.store = {
      getState() {
        return {
          messages: {
            msgData: [{ id: 1, ...msg }],
          },
        };
      },
    };
  });

  it("Returns identity found in the to field", async () => {
    msg = {
      to: [{ identityId: "id1" }],
      cc: [],
      bcc: [],
    };

    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id1");
  });

  it("Returns identity found in the cc field", async () => {
    msg = {
      to: [],
      cc: [{ identityId: "id2" }],
      bcc: [],
    };

    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id2");
  });

  it("Returns identity found in the bcc field", async () => {
    msg = {
      to: [],
      cc: [],
      bcc: [{ identityId: "id3" }],
    };
    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id3");
  });

  it("Returns the first identity found when more than one matches", async () => {
    msg = {
      to: [{ identityId: "id1" }],
      cc: [],
      bcc: [{ identityId: "id3" }],
    };
    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id1");
  });

  it("Returns the default identity for the folder account if no contacts match", async () => {
    msg = {
      to: [],
      cc: [],
      bcc: [],
      folderAccountId: 4,
    };
    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id5");
  });

  it("Returns the default identity if no account is found for the folder", async () => {
    msg = {
      to: [],
      cc: [],
      bcc: [],
      folderAccountId: -1,
    };
    let identity = await messageUtils.getBestIdentityForReply(1);

    assert.equal(identity, "id3");
  });
});
