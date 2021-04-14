/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

import { composeActions } from "../../reducer/reducer-compose.js";
import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { TextArea, TextBox } from "./composeFields.jsx";

const INPUT_FIELDS = [
  {
    props: {
      name: "from",
      title: "message.fromHeader",
      disabled: true,
    },
    component: TextBox,
  },
  {
    props: {
      name: "to",
      title: "message.toHeader",
      disabled: false,
    },
    component: TextBox,
  },
  {
    props: {
      name: "subject",
      title: "compose.fieldSubject",
      disabled: false,
    },
    component: TextBox,
  },
  {
    props: {
      name: "body",
      disabled: false,
    },
    component: TextArea,
  },
];

function _ComposeWidget({ OS, composeDetails, dispatch }) {
  function onSend() {
    dispatch(composeActions.sendMessage());
  }

  function setValue(name, value) {
    dispatch(composeActions.setValue(name, value));
  }

  // Warn about unloading
  function checkBeforeUnload(event) {
    if (composeDetails.modified) {
      event.preventDefault();
    }
  }

  React.useEffect(() => {
    window.addEventListener("beforeunload", checkBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", checkBeforeUnload);
    };
  });

  // TODO: We may need to be able to jest before we can remove these
  // undefined checks.
  const html =
    window.document && window.document.body && window.document.body.parentNode;
  if (html) {
    // TODO: Maybe should handle the tweak chrome option here.
    html.setAttribute("os", OS);
  }

  return (
    <div className="compose">
      {INPUT_FIELDS.map((Item, i) => (
        <Item.component
          {...Item.props}
          disabled={Item.props.disabled || composeDetails.sending}
          key={i}
          value={composeDetails[Item.props.name]}
          sending={composeDetails.sending}
          onChange={setValue}
        />
      ))}
      <div></div>
      <div id="sendStatus">{composeDetails.sendingMsg}</div>
      <button
        id="send"
        onClick={onSend}
        disabled={
          composeDetails.sending ||
          !composeDetails.to ||
          !composeDetails.subject
        }
      >
        {browser.i18n.getMessage("compose.send")}
      </button>
    </div>
  );
}
_ComposeWidget.propTypes = {
  dispatch: PropTypes.func.isRequired,
  OS: PropTypes.string,
  composeDetails: PropTypes.object.isRequired,
};

export const ComposeWidget = ReactRedux.connect((state) => {
  return {
    OS: state.summary.OS,
    composeDetails: state.compose,
  };
})(_ComposeWidget);
