/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOMClient from "react-dom/client";
import { Main, store } from "./compose.mjs";
import { composeActions } from "../content/reducer/reducerCompose.js";

// Render the options to the root of the page
let root = ReactDOMClient.createRoot(document.querySelector("#root"));
root.render(React.createElement(Main, null));

let params = new URLSearchParams(document.location.search);

store.dispatch(
  composeActions.initCompose({
    identityId: params.get("identityId"),
    showSubject: true,
  })
);
