/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Redux, messages, summarySlice */
// eslint-disable-next-line no-redeclare
/* exported conversationApp */

"use strict";

const conversationApp = Redux.combineReducers({
  messages,
  summary: summarySlice.reducer,
});
