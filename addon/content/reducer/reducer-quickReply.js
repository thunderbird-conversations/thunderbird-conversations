/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as RTK from "@reduxjs/toolkit";
import { browser as _browser } from "../es-modules/thunderbird-compat.js";
import { composeActions } from "./reducer-compose.js";
import { messageUtils } from "./messageUtils.js";

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
      let msg = getState().messages.msgData.find((m) => m.id == id);
      let identityId = await messageUtils.getBestIdentityForReply(msg);
      let identity = await browser.identities.get(identityId);
      let to;

      // For now cheat and use the WebExtension message which has properly formed
      // addresses.
      let webExtMsg = await browser.messages.get(id);
      switch (type) {
        case "reply": {
          to = webExtMsg.author;
          break;
        }
        case "replyAll": {
          let recipients = [webExtMsg.author];
          let identityEmail = identity.email;
          for (let section of ["recipients", "ccList", "bccList"]) {
            if (!(section in webExtMsg)) {
              continue;
            }
            for (let contact of webExtMsg[section]) {
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

      let replyOnTop = await browser.conversations.getReplyOnTop(identityId);

      let citation =
        browser.i18n.getMessage("compose.reply_header_citation", [
          webExtMsg.author,
          messageUtils.dateFormatter.format(msg.rawDate),
          messageUtils.timeFormatter.format(msg.rawDate),
        ]) + "\n";
      let body = await browser.conversations.quoteMsgHdr(msg.id, true);
      body =
        (replyOnTop == 1 ? "\n\n" : "") +
        citation +
        body
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") +
        (replyOnTop == 0 ? "\n\n" : "");

      let subject = msg.subject;
      if (!subject.toLowerCase().includes("re:")) {
        subject = "Re: " + subject;
      }
      // Initialise the compose section first, to avoid flicker, and ensure
      // the compose widget has the correct information to set focus correctly
      // on first render.
      await dispatch(
        composeActions.initCompose({
          accountId: identity.accountId,
          identityId,
          inReplyTo: id,
          to,
          subject,
          body,
          showSubject: false,
          replyOnTop,
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
