/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import { ComposeWidget } from "../compose/composeWidget.jsx";
import { quickReplyActions } from "../../reducer/reducer-quickReply.js";
import { SvgIcon } from "../svgIcon.jsx";
import PropTypes from "prop-types";

export function QuickReply({ id, multipleRecipients, recipientsIncludeLists }) {
  const dispatch = ReactRedux.useDispatch();
  const { quickReplyState } = ReactRedux.useSelector((state) => ({
    quickReplyState: state.quickReply,
  }));

  function expand(event) {
    if (event.currentTarget.classList.contains("replyList")) {
      return dispatch(quickReplyActions.expand({ id, type: "replyList" }));
    }
    if (event.currentTarget.classList.contains("replyAll")) {
      return dispatch(quickReplyActions.expand({ id, type: "replyAll" }));
    }
    return dispatch(quickReplyActions.expand({ id, type: "reply" }));
  }
  function discard() {
    return dispatch(quickReplyActions.discard());
  }

  if (quickReplyState.expanded) {
    return (
      <div className="quickReply">
        <div>
          <ComposeWidget dispatch={dispatch} discard={discard} />
        </div>
      </div>
    );
  }

  return (
    <div className="quickReply collapsed">
      <div className="replyBoxWrapper">
        <div className="replyBox reply" onClick={expand}>
          <span>{browser.i18n.getMessage("action.reply")}</span>{" "}
          <SvgIcon hash="reply" />
        </div>
        {recipientsIncludeLists && (
          <div className="replyBox replyList" onClick={expand}>
            <span>{browser.i18n.getMessage("action.replyList")}</span>{" "}
            <SvgIcon hash="list" />
          </div>
        )}
        {!recipientsIncludeLists && multipleRecipients && (
          <div className="replyBox replyAll" onClick={expand}>
            <span>{browser.i18n.getMessage("action.replyAll")}</span>{" "}
            <SvgIcon hash="reply_all" />
          </div>
        )}
      </div>
    </div>
  );
}
QuickReply.propTypes = {
  id: PropTypes.number.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
};
