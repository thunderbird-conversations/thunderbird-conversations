/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render, fireEvent, within, screen } from "@testing-library/react";
import React from "react";

// Import the components we want to test
import {
  MessageTags,
  SpecialMessageTags,
} from "../content/components/message/messageTags.mjs";

describe("SpecialMessageTags test", () => {
  it("special-tag classes are applied", async (t) => {
    const callback = t.mock.fn();
    const tagData = [
      {
        canClick: false,
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
    ];

    render(
      React.createElement(SpecialMessageTags, {
        onTagClick: callback,
        folderName: "n/a",
        specialTags: tagData,
      })
    );

    assert.equal(
      screen.getByText("DKIM signed").className,
      "success special-tag can-click"
    );
  });

  it("Clicking of special-tags", async (t) => {
    const callback = t.mock.fn();
    const tagData = [
      {
        details: null,
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "Can't click",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
      {
        details: true,
        classNames: "success",
        icon: "material-icons.svg#edit",
        name: "Can click",
        tooltip: {
          strings: ["Valid (Signed by example.com)"],
        },
      },
    ];

    render(
      React.createElement(SpecialMessageTags, {
        onTagClick: callback,
        folderName: "n/a",
        specialTags: tagData,
      })
    );

    // The first tag cannot be clicked
    fireEvent.click(screen.getByText("Can't click"));
    assert.equal(callback.mock.calls.length, 0);

    callback.mock.resetCalls();

    // The second tag can be clicked
    fireEvent.click(screen.getByText("Can click"));
    assert.equal(callback.mock.calls.length, 1);
  });
});

describe("MessageTags test", () => {
  const SAMPLE_TAGS = [
    {
      color: "#3333FF",
      key: "$label4",
      name: "To Do",
    },
    {
      color: "#993399",
      key: "$label5",
      name: "Later",
    },
    {
      color: "#993399",
      key: "$label1",
      name: "Important",
    },
  ];

  it("Basic tags", async (t) => {
    const callback = t.mock.fn();
    render(
      React.createElement(MessageTags, {
        onTagsChange: callback,
        tags: SAMPLE_TAGS,
        expanded: true,
      })
    );

    let tags = screen.getAllByRole("listitem");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    // Make sure the name actually shows up in the tag
    console.log(SAMPLE_TAGS[0].name);
    assert.match(tags[0].textContent, new RegExp(SAMPLE_TAGS[0].name));
  });

  it("Expanded tags", async (t) => {
    const callback = t.mock.fn();
    render(
      React.createElement(MessageTags, {
        onTagsChange: callback,
        tags: SAMPLE_TAGS,
        expanded: true,
      })
    );

    let tags = screen.getAllByRole("listitem");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    fireEvent.click(within(tags[0]).getByRole("button"));
    assert.equal(callback.mock.calls.length, 1);

    // The callback should be called with a list of tags with the clicked
    // tag removed.
    const payload = callback.mock.calls[0].arguments[0];
    assert.equal(payload.length, SAMPLE_TAGS.length - 1);
    assert.deepEqual(payload, SAMPLE_TAGS.slice(1));
  });

  it("Unexpanded tags", async (t) => {
    const callback = t.mock.fn();
    render(
      React.createElement(MessageTags, {
        onTagsChange: callback,
        tags: SAMPLE_TAGS,
        expanded: false,
      })
    );

    let tags = screen.getAllByRole("listitem");
    assert.equal(tags.length, SAMPLE_TAGS.length);

    // There should be no "x" button in an unexpanded tag
    assert.equal(within(tags[0]).queryByRole("button"), null);
  });
});
