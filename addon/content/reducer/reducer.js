/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Redux from "redux";

import { composeSlice } from "./reducerCompose.js";
import { conversationSlice } from "./reducerConversation.js";
import { messagesSlice } from "./reducerMessages.js";
import { summarySlice } from "./reducerSummary.js";
import { quickReplySlice } from "./reducerQuickReply.js";

export const conversationApp = Redux.combineReducers({
  compose: composeSlice.reducer,
  conversation: conversationSlice.reducer,
  messages: messagesSlice.reducer,
  summary: summarySlice.reducer,
  quickReply: quickReplySlice.reducer,
});
