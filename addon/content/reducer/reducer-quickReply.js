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
  expand({ id, type }) {
    return async function (dispatch, getState) {
      let msg = await browser.messages.get(id);
      let accountDetail = await browser.accounts.get(msg.folder.accountId);
      let accountId;
      let identityId;
      if (accountDetail && accountDetail.identities.length) {
        accountId = accountDetail.id;
        identityId = accountDetail.identities[0].id;
      }

      let to;
      switch (type) {
        case "reply": {
          to = msg.author;
          break;
        }
        case "replyAll": {
          let recipients = [msg.author];
          let identityEmail = accountDetail?.identities[0].email;
          for (let section of ["to", "ccList", "bccList"]) {
            if (!(section in msg)) {
              continue;
            }
            for (let contact of msg[section]) {
              if (contact.includes(identityEmail)) {
                continue;
              }
              recipients.push(contact);
            }
          }
          to = recipients.join(", ");
          break;
        }
        case "replyList": {
          let msg = await browser.messages.getFull(id);
          let listPost = msg.headers["list-post"][0];
          let match = listPost?.match(/<mailto:(.*?)>/);
          if (!match) {
            console.error("Could not find list-post header or match it");
            break;
          }
          to = match[1];
          break;
        }
      }

      let subject = msg.subject;
      if (!subject.toLowerCase().includes("re:")) {
        subject = "Re: " + subject;
      }
      // Initialise the compose section first, to avoid flicker, and ensure
      // the compose widget has the correct information to set focus correctly
      // on first render.
      await dispatch(
        composeActions.initCompose({
          accountId,
          identityId,
          to,
          subject,
          showSubject: false,
        })
      );
      await dispatch(
        quickReplySlice.actions.setExpandedState({ expanded: true })
      );
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

composeActions.close = () => {
  return async function (dispatch) {
    await dispatch(
      quickReplySlice.actions.setExpandedState({ expanded: false })
    );
  };
};

Object.assign(quickReplyActions, quickReplySlice.actions);
