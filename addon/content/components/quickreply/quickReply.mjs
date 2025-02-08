/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import { ComposeWidget } from "../compose/composeWidget.mjs";
import { quickReplyActions } from "../../reducer/reducerQuickReply.mjs";
import { SvgIcon } from "../svgIcon.mjs";
import PropTypes from "prop-types";

export function QuickReply({ id, multipleRecipients, recipientsIncludeLists }) {
  const dispatch = ReactRedux.useDispatch();
  const quickReplyState = ReactRedux.useSelector((state) => state.quickReply);

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
    return React.createElement(
      "div",
      { className: "quickReply" },
      React.createElement(
        "div",
        null,
        React.createElement(ComposeWidget, { dispatch, discard })
      )
    );
  }

  return React.createElement(
    "div",
    { className: "quickReply collapsed" },
    React.createElement(
      "div",
      { className: "replyBoxWrapper" },
      React.createElement(
        "div",
        {
          role: "button",
          tabIndex: "0",
          className: "replyBox reply",
          onClick: expand,
        },
        React.createElement(
          "span",
          null,
          browser.i18n.getMessage("action.reply")
        ),
        " ",
        React.createElement(SvgIcon, { hash: "reply" })
      ),
      recipientsIncludeLists &&
        React.createElement(
          "div",
          {
            role: "button",
            tabIndex: "0",
            className: "replyBox replyList",
            onClick: expand,
          },
          React.createElement(
            "span",
            null,
            browser.i18n.getMessage("action.replyList")
          ),
          " ",
          React.createElement(SvgIcon, { hash: "list" })
        ),
      !recipientsIncludeLists &&
        multipleRecipients &&
        React.createElement(
          "div",
          {
            role: "button",
            tabIndex: "0",
            className: "replyBox replyAll",
            onClick: expand,
          },
          React.createElement(
            "span",
            null,
            browser.i18n.getMessage("action.replyAll")
          ),
          " ",
          React.createElement(SvgIcon, { hash: "reply_all" })
        )
    )
  );
}
QuickReply.propTypes = {
  id: PropTypes.number.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
};
