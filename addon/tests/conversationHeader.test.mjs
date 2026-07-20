/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import "./setup.mjs";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ConversationHeader } from "../content/components/conversation/conversationHeader.mjs";

describe("ConversationHeader", () => {
  before(() => {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
    });
    ConversationHeader.dispatch = () => {};
  });

  function renderHeader() {
    const header = document.createElement("conversation-header");
    document.body.appendChild(header);
    return header;
  }

  function setView(header, view = {}) {
    header.setData(
      {
        darkReaderEnabled: false,
        isInTab: false,
        isStandalone: false,
        isVerticalLayout: false,
        loading: false,
        subject: "A subject long enough to need more than one line",
        ...view,
      },
      []
    );
  }

  it("wraps only in vertical, separate-tab, and standalone views", (t) => {
    const header = renderHeader();
    t.after(() => header.remove());
    const subject = header.shadowRoot.querySelector("linkified-subject");

    setView(header);
    assert.equal(subject.hasAttribute("wrap"), false);

    setView(header, { isVerticalLayout: true });
    assert.equal(
      subject.hasAttribute("wrap"),
      true,
      "full subject should wrap in vertical and separate views"
    );

    setView(header);
    assert.equal(
      subject.hasAttribute("wrap"),
      false,
      "returning to the classic layout should restore subject truncation"
    );

    setView(header, { isInTab: true });
    assert.equal(subject.hasAttribute("wrap"), true);

    setView(header, { isStandalone: true });
    assert.equal(subject.hasAttribute("wrap"), true);
  });
});
