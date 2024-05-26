/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import * as RTK from "@reduxjs/toolkit";
import { composeApp } from "./reducer.mjs";
import { ComposeWidget } from "../content/components/compose/composeWidget.mjs";

export const store = RTK.configureStore({ reducer: composeApp });

function ComposeWrapper() {
  const OS = ReactRedux.useSelector((state) => state.summary.OS);

  // TODO: Maybe should handle the tweak chrome option here.
  window.document.body.parentNode.setAttribute("os", OS);

  return React.createElement(ComposeWidget);
}

// The entry point for the compose page
export function Main() {
  return React.createElement(
    ReactRedux.Provider,
    { store },
    React.createElement(ComposeWrapper, null)
  );
}
