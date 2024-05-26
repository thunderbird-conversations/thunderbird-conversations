/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { messageUtils } from "../content/reducer/messageUtils.mjs";

describe("getBestIdentityForReply", () => {
  test("Returns identity found in the to field", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [{ identityId: "id1" }],
      cc: [],
      bcc: [],
    });

    expect(identity).toBe("id1");
  });

  test("Returns identity found in the cc field", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [],
      cc: [{ identityId: "id2" }],
      bcc: [],
    });

    expect(identity).toBe("id2");
  });

  test("Returns identity found in the bcc field", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [],
      cc: [],
      bcc: [{ identityId: "id3" }],
    });

    expect(identity).toBe("id3");
  });

  test("Returns the first identity found when more than one matches", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [{ identityId: "id1" }],
      cc: [],
      bcc: [{ identityId: "id3" }],
    });

    expect(identity).toBe("id1");
  });

  test("Returns the default identity for the folder account if no contacts match", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [],
      cc: [],
      bcc: [],
      folderAccountId: 4,
    });

    expect(identity).toBe("id5");
  });

  test("Returns the default identity if no account is found for the folder", async () => {
    let identity = await messageUtils.getBestIdentityForReply({
      to: [],
      cc: [],
      bcc: [],
      folderAccountId: -1,
    });

    expect(identity).toBe("id3");
  });
});
