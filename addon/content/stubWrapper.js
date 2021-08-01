/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

window.addEventListener(
  "load",
  function (event) {
    let browser = document.getElementById("multimessage");

    browser.addEventListener(
      "load",
      () => {
        let obs = new MutationObserver((mutationsList) => {
          if (document.title != browser.contentDocument.title) {
            document.title = browser.contentDocument.title;
          }
        });

        obs.observe(browser.contentDocument.querySelector("title"), {
          childList: true,
        });
      },
      { once: true, capture: true }
    );

    browser.loadURI(
      `chrome://conversations/content/stub.html${window.arguments[0].params}`,
      {
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
      }
    );
  },
  { once: true }
);
