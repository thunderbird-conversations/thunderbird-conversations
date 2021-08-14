/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as RTK from "@reduxjs/toolkit";
import { browser as _browser } from "../es-modules/thunderbird-compat.js";

// Prefer the global browser object to the imported one.
window.browser = window.browser || _browser;

export const initialCompose = {
  modified: false,
  sending: false,
  sendingMsg: "",
  showSubject: false,
};

export const composeSlice = RTK.createSlice({
  name: "compose",
  initialState: initialCompose,
  reducers: {
    setFromDetails(state, { payload }) {
      let userModified = payload.userModified;
      delete payload.userModified;
      if (!userModified || state.modified) {
        return { ...state, ...payload };
      }
      for (let [k, v] of Object.entries(payload)) {
        if (state[k] != v) {
          return { ...state, ...payload, modified: true };
        }
      }
      // If we get here, nothing changed.
      return state;
    },
    setSendStatus(state, { payload }) {
      let newState = { ...state };
      if ("sending" in payload) {
        newState.sending = payload.sending;
      }
      if ("modified" in payload) {
        newState.modified = payload.modified;
      }
      if ("sendingMsg" in payload) {
        newState.sendingMsg = payload.sendingMsg;
      }
      return newState;
    },
    resetStore() {
      return initialCompose;
    },
  },
});

export const composeActions = {
  initCompose({ accountId, identityId, to, subject, showSubject }) {
    return async function (dispatch) {
      await dispatch(composeSlice.actions.resetStore());

      // Set from to be the default account / identity.
      let accountDetail;
      if (!accountId) {
        let accounts = await browser.accounts.list();
        accountDetail = accounts[0];
      } else {
        accountDetail = await browser.accounts.get(accountId);
      }

      let identityDetail = identityId
        ? accountDetail.identities.find((i) => i.id == identityId)
        : accountDetail.identities[0];

      await dispatch(
        composeSlice.actions.setFromDetails({
          userModified: false,
          from: identityDetail.email,
          identityId: identityDetail.id,
          email: identityDetail.email,
          to,
          subject,
          showSubject,
        })
      );
    };
  },
  setValue(name, value) {
    return async function (dispatch, getState) {
      let { from, to, subject, body } = getState().compose;
      await dispatch(
        composeSlice.actions.setFromDetails({
          from,
          to,
          subject,
          body,
          [name]: value,
          userModified: true,
        })
      );
    };
  },
  resetStore() {
    return async (dispatch) => {
      await dispatch(composeSlice.actions.resetStore());
    };
  },
  sendMessage() {
    return async function (dispatch, getState) {
      let state = getState().compose;
      await dispatch(
        composeSlice.actions.setSendStatus({
          sending: true,
          sendingMsg: browser.i18n.getMessage("compose.sendingMessage"),
        })
      );
      let success = true;
      try {
        await browser.convCompose.send({
          from: state.identityId,
          to: state.to,
          subject: state.subject,
          body: state.body || "",
        });
      } catch (ex) {
        console.error(ex);
        success = false;
      }
      await dispatch(
        composeSlice.actions.setSendStatus({
          sending: false,
          modified: false,
          sendingMsg: success
            ? ""
            : browser.i18n.getMessage("compose.couldntSendTheMessage"),
        })
      );
      if (success) {
        await dispatch(composeActions.close());
      }
    };
  },
  /**
   * A generic close action that is designed to be overriden by compose in a
   * new tab, or by quick reply, so that it may be handled correctly.
   */
  close() {
    return async function (dispatch, getState) {};
  },
};

Object.assign(composeActions, composeSlice.actions);
