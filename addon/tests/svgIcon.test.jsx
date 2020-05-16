/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
// const { enzyme, React } = require("./utils");
/* global module */
const esmImport = require("esm")(module, { cjs: true, force: true });
const { React } = esmImport("react");
const { mount } = require("enzyme/mount");

// Import the components we want to test
const { SvgIcon } = require("../content/svgIcon.js");

describe("SvgIcon test", () => {
  test("renders given a full path", async () => {
    const PATH = "/full/path/to/icon";
    const wrapper = mount(<SvgIcon fullPath={PATH} />);

    expect(wrapper.find("use").html()).toMatch(PATH);
  });

  test("renders given a hash", async () => {
    const HASH = "abc";
    const wrapper = mount(<SvgIcon hash={HASH} />);

    expect(wrapper.find("use").html()).toMatch("#" + HASH);
  });
});
