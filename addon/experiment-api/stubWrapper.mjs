/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

window.addEventListener(
  "load",
  // @ts-ignore
  function (event) {
    // eslint-disable-next-line no-shadow
    let browser = document.getElementById("multiMessageBrowser");

    browser.addEventListener(
      "load",
      () => {
        // @ts-ignore
        let obs = new MutationObserver((mutationsList) => {
          // @ts-ignore
          if (document.title != browser.contentDocument.title) {
            // @ts-ignore
            document.title = browser.contentDocument.title;
          }
        });

        // @ts-ignore
        obs.observe(browser.contentDocument.querySelector("title"), {
          childList: true,
        });
      },
      { once: true, capture: true }
    );

    // @ts-ignore
    browser.loadURI(
      // @ts-ignore
      Services.io.newURI(
        // @ts-ignore
        `chrome://conversations/content/experiment-api/stub.html${window.arguments[0].params}`
      ),
      {
        triggeringPrincipal:
          // @ts-ignore
          Services.scriptSecurityManager.getSystemPrincipal(),
      }
    );
  },
  { once: true }
);
