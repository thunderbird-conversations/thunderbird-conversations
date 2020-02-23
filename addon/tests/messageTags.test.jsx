/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
const { esmImport, enzyme, React } = require("./utils");

// Import the components we want to test
const {
  MessageTag,
  MessageTags,
  SpecialMessageTag,
  SpecialMessageTags,
} = esmImport("../content/es-modules/components/message-tags.js");

// We don't care about translations in these tests, so create a dummy `strings`
// object.
const strings = {
  get(x) {
    return x;
  },
};

describe("SpecialMessageTags test", () => {
  test("special-tag classes are applied", async () => {
    const callback = jest.fn();
    const tagData = [
      {
        canClick: false,
        classNames: "dkim-signed SUCCESS",
        icon: "chrome://conversations/skin/material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          type: "dkim",
          strings: ["Valid (Signed by example.com)", []],
        },
      },
    ];

    const wrapper = enzyme.mount(
      <SpecialMessageTags
        onTagClick={callback}
        folderName="n/a"
        inView={true}
        strings={strings}
        specialTags={tagData}
      />
    );

    // There should be one parent node with class `special-tags`
    expect(wrapper.find(".special-tags")).toHaveLength(1);
    // There should be one react child `SpecialMessageTag`
    expect(wrapper.find(SpecialMessageTag)).toHaveLength(1);
    // That child should have all relevant classes applied
    expect(wrapper.find(".dkim-signed.SUCCESS.special-tag")).toHaveLength(1);
  });

  test("Clicking of special-tags", async () => {
    const callback = jest.fn();
    const tagData = [
      {
        details: null,
        classNames: "dkim-signed SUCCESS",
        icon: "chrome://conversations/skin/material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          type: "dkim",
          strings: ["Valid (Signed by example.com)", []],
        },
      },
      {
        details: true,
        classNames: "dkim-signed SUCCESS",
        icon: "chrome://conversations/skin/material-icons.svg#edit",
        name: "DKIM signed",
        tooltip: {
          type: "dkim",
          strings: ["Valid (Signed by example.com)", []],
        },
      },
    ];

    const wrapper = enzyme.mount(
      <SpecialMessageTags
        onTagClick={callback}
        folderName="n/a"
        inView={true}
        strings={strings}
        specialTags={tagData}
      />
    );

    // The first tag cannot be clicked
    const special1 = wrapper.find(SpecialMessageTag).at(0);
    special1.simulate("click");
    expect(callback.mock.calls).toHaveLength(0);

    // The second tag can be clicked
    const special2 = wrapper.find(SpecialMessageTag).at(1);
    callback.mockReset();
    special2.simulate("click");
    expect(callback.mock.calls).toHaveLength(1);
  });
});

describe("MessageTags test", () => {
  const SAMPLE_TAGS = [
    {
      color: "#3333FF",
      id: "$label4",
      name: "To Do",
    },
    {
      color: "#993399",
      id: "$label5",
      name: "Later",
    },
  ];

  test("Expanded tags", async () => {
    const callback = jest.fn();
    const wrapper = enzyme.mount(
      <MessageTags onTagsChange={callback} tags={SAMPLE_TAGS} expanded={true} />
    );

    expect(wrapper.find(MessageTag)).toHaveLength(2);
    const tag = wrapper.find(MessageTag).at(0);
    // There should be an "x" button that triggers the callback when clicked
    expect(tag.find(".tag-x")).toHaveLength(1);
    tag.find(".tag-x").simulate("click");
    expect(callback.mock.calls).toHaveLength(1);
  });

  test("Unexpanded tags", async () => {
    const callback = jest.fn();
    const wrapper = enzyme.mount(
      <MessageTags
        onTagsChange={callback}
        tags={SAMPLE_TAGS}
        expanded={false}
      />
    );

    expect(wrapper.find(MessageTag)).toHaveLength(2);
    const tag = wrapper.find(MessageTag).at(0);
    // There should be no "x" button in an unexpanded tag
    expect(tag.find(".tag-x")).toHaveLength(0);
  });
});
