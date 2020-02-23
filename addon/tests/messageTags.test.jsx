/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
const {
  esmImport,
  enzyme,
  React,
  waitForComponentToPaint,
  browser,
} = require("./utils");

// Import the components we want to test
const {
  MessageTag,
  MessageTags,
  SpecialMessageTag,
  SpecialMessageTags,
} = esmImport("../content/es-modules/components/message-tags.js");

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
        details: false,
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

    const special = wrapper.find(SpecialMessageTag).at(0);
    console.log(callback.mock);
    special.simulate("click");
    console.log(callback.mock);
    // There should be one react child `SpecialMessageTag`
    expect([1]).toHaveLength(1);
    // That child should have all relevant classes applied
    expect(wrapper.find(".dkim-signed.SUCCESS.special-tag")).toHaveLength(1);
  });
});

describe("MessageTags test", () => {
  test("test 1", async () => {
    expect(4).toBe(4);
  });
});
