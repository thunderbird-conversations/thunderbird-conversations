/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import * as RTK from "@reduxjs/toolkit";
import { composeApp } from "./reducer.mjs";
import { ComposeWidget } from "../content/components/compose/composeWidget.mjs";

export const store = RTK.configureStore({ reducer: composeApp });

/**
 * @typedef {ReturnType<store["getState"]>} RootState
 * @typedef {store["dispatch"]} AppDispatch
 * */

/** @type {ReturnType<typeof ReactRedux.useSelector.withTypes<RootState>>} */
const useAppSelector = ReactRedux.useSelector;

function ComposeWrapper() {
  const OS = useAppSelector((state) => state.summary.OS);

  // TODO: Maybe should handle the tweak chrome option here.
  window.document.body.parentElement.setAttribute("os", OS);

  return React.createElement(ComposeWidget);
}

// The entry point for the compose page
export function Main() {
  return React.createElement(
    ReactRedux.Provider,
    { store, children: undefined },
    React.createElement(ComposeWrapper, null)
  );
}
