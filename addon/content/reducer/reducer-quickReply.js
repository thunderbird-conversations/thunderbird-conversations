/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as RTK from "@reduxjs/toolkit";
import { browser as _browser } from "../es-modules/thunderbird-compat.js";
import { composeActions } from "./reducer-compose.js";

// Prefer the global browser object to the imported one.
window.browser = window.browser || _browser;

export const initialQuickReply = {
  expanded: false,
};

export const quickReplySlice = RTK.createSlice({
  name: "quickReply",
  initialState: initialQuickReply,
  reducers: {
    setExpandedState(state, { payload }) {
      return {
        ...state,
        expanded: payload.expanded,
      };
    },
  },
});

export const quickReplyActions = {
  expand() {
    return async function (dispatch, getState) {
      await dispatch(
        quickReplySlice.actions.setExpandedState({ expanded: true })
      );
      // TODO: Add proper account/identity set-up.
      await dispatch(composeActions.initCompose());
    };
  },
  discard() {
    return async function (dispatch) {
      await dispatch(
        quickReplySlice.actions.setExpandedState({ expanded: false })
      );
    };
  },
};

Object.assign(quickReplyActions, quickReplySlice.actions);
