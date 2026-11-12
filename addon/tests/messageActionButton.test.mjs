/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

describe("ActionButton", () => {
  before(async () => {
    // Import for side effects: this defines the `action-button` element.
    await import("../content/components/message/messageActionButton.mjs");
  });

  function renderButton(type, msgId) {
    const button =
      /** @type {import("../content/components/message/messageActionButton.mjs").ActionButton} */ (
        document.createElement("action-button")
      );
    button.setAttribute("msgId", String(msgId));
    button.setAttribute("type", type);
    document.body.appendChild(button);
    return button;
  }

  it("deletes a single message as a user action", (t) => {
    const mockedDelete = t.mock.method(
      browser.messages,
      "delete",
      async () => {}
    );
    const button = renderButton("delete", 7);
    t.after(() => button.remove());

    button.handleActivation(new window.MouseEvent("click"));

    assert.equal(mockedDelete.mock.calls.length, 1);
    assert.deepEqual(mockedDelete.mock.calls[0].arguments[0], [7]);
    assert.equal(mockedDelete.mock.calls[0].arguments[1].isUserAction, true);
    assert.notEqual(
      mockedDelete.mock.calls[0].arguments[1].deletePermanently,
      true
    );
  });
});
