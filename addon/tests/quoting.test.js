/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
const { esmImport } = require("./utils");

// Prettier is used to normalize the html formatting so we can reliably use it to compare HTML with
// text diffing.
const prettier = require("prettier");

// Import the components we want to test
const { Quoting } = esmImport("../content/es-modules/quoting.js");

const samples = {
  hotmail: [
    {
      unquoted: `
        <body dir="ltr">
          <meta http-equiv="Content-Type" content="text/html; " />
          <style type="text/css" style="display: none">
            P {
              margin-top: 0;
              margin-bottom: 0;
            }
          </style>

          <div class="moz-text-html" lang="x-western">
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">This is really good to hear</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Most likely going to move &nbsp;to meet you and catch up.</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Best Regards,&nbsp;</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Someone</div>
            <div>
              <hr tabindex="-1" style="display: inline-block; width: 98%" />
              <div id="divRplyFwdMsg" dir="ltr">
                <font style="font-size: 11pt" face="Calibri, sans-serif" color="#000000"
                  ><b>From:</b> Someone &lt;xxx@gmail.com&gt;<br />
                  <b>Sent:</b> September 8, 2019 12:42 PM<br />
                  <b>To:</b> Other Person &lt;yyy@hotmail.com&gt;<br />
                  <b>Subject:</b> Re: Thank You From the Bottom of My Heart</font
                >
                <div>&nbsp;</div>
              </div>
              <div class="BodyFragment">
                <font size="2"
                  ><span style="font-size: 11pt">
                    <div class="PlainText">
                      Hi Other Person! I'm so glad you're doing well. Your kind words mean a lot
                      <br />
                      to me.<br />
                      <br />
                      As you know :-).<br />
                      <br />
                      What will you do?<br />
                      <br />
                      &nbsp;&nbsp; XXX<br />
                      <br />
                      <br />
                      <br />
                      On 9/7/19 1:14 PM, Someone wrote:<br />
                      &gt; Dear Dr.,<br />
                      &gt; <br />
                      &gt; I hope this email finds you very well,<br />
                      &gt; <br />
                    </div> </span
                ></font>
              </div>
            </div>
          </div>
        </body>`,
      quoted: `
        <body dir="ltr">
          <meta http-equiv="Content-Type" content="text/html; " />
          <style type="text/css" style="display: none">
            P {
              margin-top: 0;
              margin-bottom: 0;
            }
          </style>
        
          <div class="moz-text-html" lang="x-western">
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">This is really good to hear</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Most likely going to move &nbsp;to meet you and catch up.</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Best Regards,&nbsp;</div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">
              <br />
            </div>
            <div style="font-family: Calibri, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0)">Someone</div>
            <blockquote type="cite">
              <div>
                <div id="divRplyFwdMsg" dir="ltr">
                  <font style="font-size: 11pt" face="Calibri, sans-serif" color="#000000"
                    ><b>From:</b> Someone &lt;xxx@gmail.com&gt;<br />
                    <b>Sent:</b> September 8, 2019 12:42 PM<br />
                    <b>To:</b> Other Person &lt;yyy@hotmail.com&gt;<br />
                    <b>Subject:</b> Re: Thank You From the Bottom of My Heart</font
                  >
                  <div>&nbsp;</div>
                </div>
                <div class="BodyFragment">
                  <font size="2"
                    ><span style="font-size: 11pt">
                      <div class="PlainText">
                        Hi Other Person! I'm so glad you're doing well. Your kind words mean a lot
                        <br />
                        to me.<br />
                        <br />
                        As you know :-).<br />
                        <br />
                        What will you do?<br />
                        <br />
                        &nbsp;&nbsp; XXX<br />
                        <br />
                        <br />
                        <br />
                        On 9/7/19 1:14 PM, Someone wrote:<br />
                        &gt; Dear Dr.,<br />
                        &gt; <br />
                        &gt; I hope this email finds you very well,<br />
                        &gt; <br />
                      </div> </span
                  ></font>
                </div>
              </div>
            </blockquote>
          </div>
        </body>`,
    },
  ],
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

const PRETTIER_OPTS = { parser: "html", tabWidth: 0, printWidth: 120 };

describe("Quoting test", () => {
  test("Find quotes in Hotmail messages", async () => {
    const parser = new DOMParser();
    for (const { unquoted, quoted } of samples.hotmail) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.convertHotmailQuotingToBlockquote1(doc);

      const prettyQuoted = prettier.format(doc.body.outerHTML, PRETTIER_OPTS);
      const prettyExpected = prettier.format(quoted, PRETTIER_OPTS);

      expect(prettyQuoted).toBe(prettyExpected);
    }
  });
  test("Find quotes in forwarded plain-text messages", async () => {
    const parser = new DOMParser();
    for (const { unquoted, quoted } of samples.forward) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.convertForwardedToBlockquote(doc);

      const prettyQuoted = prettier.format(doc.body.outerHTML, PRETTIER_OPTS);
      const prettyExpected = prettier.format(quoted, PRETTIER_OPTS);

      expect(prettyQuoted).toBe(prettyExpected);
    }
  });
  test("Merge disjoint blockquotes", async () => {
    const parser = new DOMParser();
    for (const { unquoted, quoted } of samples.disjoint) {
      const doc = parser.parseFromString(unquoted, "text/html");
      Quoting.fusionBlockquotes(doc);

      const prettyQuoted = prettier.format(doc.body.outerHTML, PRETTIER_OPTS);
      const prettyExpected = prettier.format(quoted, PRETTIER_OPTS);

      expect(prettyQuoted).toBe(prettyExpected);
    }
  });
});
