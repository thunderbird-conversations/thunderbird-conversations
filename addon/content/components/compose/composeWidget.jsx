/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { composeActions } from "../../reducer/reducer-compose.js";
import React from "react";
import * as ReactRedux from "react-redux";
import { TextArea, TextBox } from "./composeFields.jsx";

export function ComposeWidget() {
  const dispatch = ReactRedux.useDispatch();
  const { composeState } = ReactRedux.useSelector((state) => ({
    composeState: state.compose,
  }));
  const bodyInput = React.createRef();
  const subjectInput = React.createRef();

  React.useEffect(() => {
    if (composeState.subject) {
      bodyInput.current.focus();
    } else {
      subjectInput.current.focus();
    }
  }, []);

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
      <TextBox
        name="from"
        title="message.fromHeader"
        disabled={true}
        value={composeState.from}
        sending={composeState.sending}
        onChange={setValue}
      />
      <TextBox
        name="to"
        title="message.toHeader"
        value={composeState.to}
        sending={composeState.sending}
        onChange={setValue}
      />
      <TextBox
        name="subject"
        ref={subjectInput}
        title="compose.fieldSubject"
        value={composeState.subject}
        sending={composeState.sending}
        onChange={setValue}
      />
      <TextArea
        name="body"
        ref={bodyInput}
        value={composeState.body}
        sending={composeState.sending}
        onChange={setValue}
      />
      <div></div>
      <div id="sendStatus">{composeState.sendingMsg}</div>
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
  );
}
