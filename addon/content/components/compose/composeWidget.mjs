/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { composeActions } from "../../reducer/reducerCompose.js";
import React from "react";
import * as ReactRedux from "react-redux";
import { TextArea, TextBox } from "./composeFields.mjs";
import PropTypes from "prop-types";
import { SvgIcon } from "../svgIcon.mjs";

export function ComposeWidget({ discard }) {
  const dispatch = ReactRedux.useDispatch();
  const composeState = ReactRedux.useSelector((state) => state.compose);
  const bodyInput = React.createRef();
  const subjectInput = React.createRef();

  React.useEffect(() => {
    if (composeState.subject || !composeState.showSubject) {
      bodyInput.current.focus();
    } else {
      subjectInput.current.focus();
    }
  }, []);

  React.useEffect(() => {
    if (composeState.replyOnTop === null) {
      return;
    }

    switch (composeState.replyOnTop) {
      case 0: {
        let textLength = composeState.body.length;
        bodyInput.current.setSelectionRange(textLength, textLength);
        break;
      }
      case 1: {
        bodyInput.current.setSelectionRange(0, 0);
        break;
      }
      case 2: {
        let textLength = composeState.body.length;
        bodyInput.current.setSelectionRange(0, textLength);
        break;
      }
    }
  }, [composeState.replyOnTop]);

  function onSend() {
    dispatch(composeActions.sendMessage());
  }

  function setValue(name, value) {
    dispatch(composeActions.setValue(name, value));
  }

  // Warn about unloading
  function checkBeforeUnload(event) {
    if (composeState.modified) {
      event.preventDefault();
    }
  }

  React.useEffect(() => {
    window.addEventListener("beforeunload", checkBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", checkBeforeUnload);
    };
  });

  return React.createElement(
    "div",
    { className: "compose" },
    React.createElement(
      "div",
      { className: "from" },
      browser.i18n.getMessage("message.fromHeader"),
      " ",
      React.createElement("span", null, composeState.from)
    ),
    React.createElement(TextBox, {
      name: "to",
      title: "message.toHeader",
      value: composeState.to,
      sending: composeState.sending,
      onChange: setValue,
    }),
    composeState.showSubject &&
      React.createElement(TextBox, {
        name: "subject",
        ref: subjectInput,
        title: "compose.fieldSubject",
        value: composeState.subject,
        sending: composeState.sending,
        onChange: setValue,
      }),
    React.createElement(TextArea, {
      name: "body",
      ref: bodyInput,
      value: composeState.body,
      sending: composeState.sending,
      onChange: setValue,
    }),
    React.createElement(
      "div",
      {
        id: "sendStatus",
      },
      composeState.sendingMsg
    ),
    React.createElement(
      "div",
      { className: "buttons" },
      React.createElement(
        "button",
        {
          id: "discard",
          onClick: discard,
          disabled: !discard,
        },
        React.createElement(SvgIcon, {
          ariaHidden: true,
          hash: "delete_forever",
        }),
        browser.i18n.getMessage("compose.discard")
      ),
      React.createElement(
        "button",
        {
          id: "send",
          onClick: onSend,
          disabled:
            composeState.sending || !composeState.to || !composeState.subject,
        },
        React.createElement(SvgIcon, { ariaHidden: true, hash: "send" }),
        browser.i18n.getMessage("compose.send")
      )
    )
  );
}
ComposeWidget.propTypes = {
  discard: PropTypes.func,
};
