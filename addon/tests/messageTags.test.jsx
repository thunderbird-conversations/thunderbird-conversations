/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, fireEvent, within, screen } from "@testing-library/react";
import React from "react";
import { jest } from "@jest/globals";

// Import the components we want to test
import {
  MessageTags,
  SpecialMessageTags,
} from "../content/components/message/messageTags.jsx";

describe("SpecialMessageTags test", () => {
  test("special-tag classes are applied", async () => {
    const callback = jest.fn();
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
      <SpecialMessageTags
        onTagClick={callback}
        folderName="n/a"
        specialTags={tagData}
      />
    );

    expect(screen.getByText("DKIM signed").className).toBe(
      "success special-tag can-click"
    );
  });

  test("Clicking of special-tags", async () => {
    const callback = jest.fn();
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
      <SpecialMessageTags
        onTagClick={callback}
        folderName="n/a"
        specialTags={tagData}
      />
    );

    // The first tag cannot be clicked
    fireEvent.click(screen.getByText("Can't click"));
    expect(callback.mock.calls).toHaveLength(0);

    callback.mockReset();

    // The second tag can be clicked
    fireEvent.click(screen.getByText("Can click"));
    expect(callback.mock.calls).toHaveLength(1);
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

  test("Basic tags", async () => {
    const callback = jest.fn();
    render(
      <MessageTags onTagsChange={callback} tags={SAMPLE_TAGS} expanded={true} />
    );

    let tags = screen.getAllByRole("listitem");
    expect(tags).toHaveLength(SAMPLE_TAGS.length);

    // Make sure the name actually shows up in the tag
    expect(tags[0].textContent).toEqual(
      expect.stringContaining(SAMPLE_TAGS[0].name)
    );
  });

  test("Expanded tags", async () => {
    const callback = jest.fn();
    render(
      <MessageTags onTagsChange={callback} tags={SAMPLE_TAGS} expanded={true} />
    );

    let tags = screen.getAllByRole("listitem");
    expect(tags).toHaveLength(SAMPLE_TAGS.length);

    fireEvent.click(within(tags[0]).getByRole("button"));
    expect(callback.mock.calls).toHaveLength(1);

    // The callback should be called with a list of tags with the clicked
    // tag removed.
    const payload = callback.mock.calls[0][0];
    expect(payload).toHaveLength(SAMPLE_TAGS.length - 1);
    expect(payload).toMatchObject(SAMPLE_TAGS.slice(1));
  });

  test("Unexpanded tags", async () => {
    const callback = jest.fn();
    render(
      <MessageTags
        onTagsChange={callback}
        tags={SAMPLE_TAGS}
        expanded={false}
      />
    );

    let tags = screen.getAllByRole("listitem");
    expect(tags).toHaveLength(SAMPLE_TAGS.length);

    // There should be no "x" button in an unexpanded tag
    expect(within(tags[0]).queryByRole("button")).toBe(null);
  });
});
