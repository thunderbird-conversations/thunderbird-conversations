/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Redux from "redux";

import { composeSlice } from "./reducer-compose.js";
import { messagesSlice } from "./reducer-messages.js";
import { summarySlice } from "./reducer-summary.js";
import { quickReplySlice } from "./reducer-quickReply.js";

export const conversationApp = Redux.combineReducers({
  compose: composeSlice.reducer,
  messages: messagesSlice.reducer,
  summary: summarySlice.reducer,
  quickReply: quickReplySlice.reducer,
});
