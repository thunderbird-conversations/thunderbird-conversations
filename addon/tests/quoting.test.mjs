/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Prettier is used to normalize the html formatting so we can reliably use it to compare HTML with
// text diffing.
import prettier from "prettier";
import html from "prettier/plugins/html";

// Import the components we want to test
import { Quoting } from "../content/utils/quoting.mjs";

const samples = {
  forward: [
    {
      unquoted: `<body>That's really interesting. Thanks for sharing.
        <br><br>
          -----Original Message-----<br>
        From: abc@aol.com<br>
        To: xxx@aol.com<br>
        Sent: Sat, 20 Sep 2008 9:21 am<br>
        Subject: Fwd: Did you ever wonder what happened to the guy?<br><br>

        look at that!</body>
          `,
      quoted: `<body>
      That's really interesting. Thanks for sharing.
      <blockquote type="cite">
      <br /><br />
      -----Original Message-----<br />
      From: abc@aol.com<br />
      To: xxx@aol.com<br />
      Sent: Sat, 20 Sep 2008 9:21 am<br />
      Subject: Fwd: Did you ever wonder what happened to the guy?<br /><br />

      look at that!
      </blockquote>
      </body>`,
    },
  ],
  // Current outlook message parsing relies on `getComputedStyle`. There must be an alternative,
  // but message samples are needed.
  outlook: [
    {
      unquoted: `<body><p>Start of a message</p><div class="OutlookMessageHeader">From: abc@aol.com</div>
      <div style="border-top: 1px solid rgb(181, 196, 223)">Some quoted stuff</div></body>`,
      quoted: ``,
    },
  ],
  disjoint: [
    {
      unquoted: `
        <body>
          <p>Start of message</p>
          <blockquote>A first quote</blockquote>
          <br />
          <br />
          <blockquote>A second quote</blockquote>

          <blockquote>A third quote<blockquote>with a quote inside</blockquote></blockquote>
        </body>
      `,
      quoted: `
        <body>
          <p>Start of message</p>
          <blockquote>
            A first quote
            <br />
            <br />
            A second quote A third quote
            <blockquote>with a quote inside</blockquote>
          </blockquote>
        </body>
      `,
    },
  ],
};

const PRETTIER_OPTS = {
  parser: "html",
  plugins: [html],
  tabWidth: 0,
  printWidth: 120,
};

describe("Quoting test", () => {
  it("Find quotes in forwarded plain-text messages", async () => {
    const parser = new DOMParser();
    for (const { unquoted, quoted } of samples.forward) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.convertForwardedToBlockquote(doc);

      const prettyQuoted = await prettier.format(
        doc.body.outerHTML,
        PRETTIER_OPTS
      );
      const prettyExpected = await prettier.format(quoted, PRETTIER_OPTS);

      assert.equal(prettyQuoted, prettyExpected);
    }
  });
  it("Merge disjoint blockquotes", async () => {
    const parser = new DOMParser();
    for (const { unquoted, quoted } of samples.disjoint) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.fusionBlockquotes(doc);

      const prettyQuoted = await prettier.format(
        doc.body.outerHTML,
        PRETTIER_OPTS
      );
      const prettyExpected = await prettier.format(quoted, PRETTIER_OPTS);

      assert.equal(prettyQuoted, prettyExpected);
    }
  });
  it("Normalize blockquotes using all methods", async () => {
    const allSampleEmails = [].concat(samples.disjoint, samples.forward);

    const parser = new DOMParser();
    for (const { unquoted, quoted } of allSampleEmails) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.normalizeBlockquotes(doc);

      const prettyQuoted = await prettier.format(
        doc.body.outerHTML,
        PRETTIER_OPTS
      );
      const prettyExpected = await prettier.format(quoted, PRETTIER_OPTS);

      assert.equal(prettyQuoted, prettyExpected);
    }
  });
});
