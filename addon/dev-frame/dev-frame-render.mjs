/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOMClient from "react-dom/client";
import { browser } from "../content/esmodules/thunderbirdCompat.mjs";
import { Main } from "./dev-frame.mjs";

(async function renderAfterInitialized() {
  // When running in the browser, we shim `i18n` by dynamically
  // loading translations using a `fetch` call. We delay rendering until
  // these translations are loaded.
  await browser.i18n.isLoaded;

  // Render the options to the root of the page
  let root = ReactDOMClient.createRoot(document.querySelector("#root"));
  root.render(React.createElement(Main, null));
})().catch(console.error);
