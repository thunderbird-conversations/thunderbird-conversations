/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
const { esmImport, enzyme, React } = require("./utils");

// Import the components we want to test
const { SvgIcon } = esmImport("../content/es-modules/components/svg-icon.js");

describe("SvgIcon test", () => {
  test("renders given a full path", async () => {
    const PATH = "/full/path/to/icon";
    const wrapper = enzyme.mount(<SvgIcon fullPath={PATH} />);

    expect(wrapper.find("use").html()).toMatch(PATH);
  });

  test("renders given a hash", async () => {
    const HASH = "abc";
    const wrapper = enzyme.mount(<SvgIcon hash={HASH} />);

    expect(wrapper.find("use").html()).toMatch("#" + HASH);
  });
});
