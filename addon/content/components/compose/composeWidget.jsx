/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { composeActions } from "../../reducer/reducerCompose.js";
import React from "react";
import * as ReactRedux from "react-redux";
import { TextArea, TextBox } from "./composeFields.jsx";
import PropTypes from "prop-types";

export function ComposeWidget({ discard }) {
  const dispatch = ReactRedux.useDispatch();
  const { composeState } = ReactRedux.useSelector((state) => ({
    composeState: state.compose,
  }));
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

  return (
    <div className="compose">
      <div className="from">
        {browser.i18n.getMessage("message.fromHeader")}{" "}
        <span>{composeState.from}</span>
      </div>
      <TextBox
        name="to"
        title="message.toHeader"
        value={composeState.to}
        sending={composeState.sending}
        onChange={setValue}
      />
      {composeState.showSubject && (
        <TextBox
          name="subject"
          ref={subjectInput}
          title="compose.fieldSubject"
          value={composeState.subject}
          sending={composeState.sending}
          onChange={setValue}
        />
      )}
      <TextArea
        name="body"
        ref={bodyInput}
        value={composeState.body}
        sending={composeState.sending}
        onChange={setValue}
      />
      <div id="sendStatus">{composeState.sendingMsg}</div>
      <div className="buttons">
        {discard && (
          <a className="link" onClick={discard}>
            {browser.i18n.getMessage("compose.discard")}
          </a>
        )}
        <button
          id="send"
          onClick={onSend}
          disabled={
            composeState.sending || !composeState.to || !composeState.subject
          }
        >
          {browser.i18n.getMessage("compose.send")}
        </button>
      </div>
    </div>
  );
}
ComposeWidget.propTypes = {
  discard: PropTypes.func,
};
