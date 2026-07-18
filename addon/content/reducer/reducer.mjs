/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as Redux from "redux";

import { conversationSlice } from "./reducerConversation.mjs";
import { messagesSlice } from "./reducerMessages.mjs";
import { summarySlice } from "./reducerSummary.mjs";
import { quickReplySlice } from "./reducerQuickReply.mjs";

export const conversationApp = Redux.combineReducers({
  conversation: conversationSlice.reducer,
  messages: messagesSlice.reducer,
  summary: summarySlice.reducer,
  quickReply: quickReplySlice.reducer,
});
