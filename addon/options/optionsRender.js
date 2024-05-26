/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOMClient from "react-dom/client";
import { Main } from "./options.mjs";

// Render the options to the root of the page
let root = ReactDOMClient.createRoot(document.querySelector("#root"));
root.render(React.createElement(Main, null));
