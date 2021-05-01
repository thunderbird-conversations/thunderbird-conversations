/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Redux from "redux";

import { composeSlice } from "../content/reducer/reducer-compose.js";
import { summarySlice } from "../content/reducer/reducer-summary.js";

export const composeApp = Redux.combineReducers({
  compose: composeSlice.reducer,
  summary: summarySlice.reducer,
});
