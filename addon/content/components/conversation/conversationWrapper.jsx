/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { ConversationFooter } from "./conversationFooter.jsx";
import { ConversationHeader } from "./conversationHeader.jsx";
import { controllerActions } from "../../reducer/controllerActions.js";
import { MessageList } from "../message/messageList.jsx";
import { browser } from "../../es-modules/thunderbird-compat.js";

/**
 * This is a wrapper class around the whole conversation. It also kicks off
 * the message loading routines.
 */
class _ConversationWrapper extends React.PureComponent {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this._setHTMLAttributes();

    // When moving to a WebExtension page this can simply be moved to CSS (see
    // options.css).
    browser.conversations.getLocaleDirection().then((dir) => {
      document.documentElement.setAttribute("dir", dir);
    });

    this.props.dispatch(controllerActions.waitForStartup());
  }

  componentDidUpdate(prevProps) {
    this._setHTMLAttributes(prevProps);
  }

  _setHTMLAttributes(prevProps) {
    if (
      prevProps &&
      this.props.OS == prevProps.OS &&
      this.props.tweakChrome == prevProps.tweakChrome
    ) {
      return;
    }

    const html = document.body.parentNode;
    if (this.props.tweakChrome && this.props.OS) {
      html.setAttribute("os", this.props.OS);
    } else {
      html.removeAttribute("os");
    }
  }

  render() {
    return (
      <React.Fragment>
        <div id="popup-container"></div>
        <ConversationHeader />
        <MessageList />
        <ConversationFooter />
      </React.Fragment>
    );
  }
}

_ConversationWrapper.propTypes = {
  dispatch: PropTypes.func.isRequired,
  tweakChrome: PropTypes.bool.isRequired,
  OS: PropTypes.string,
};

export const ConversationWrapper = ReactRedux.connect((state) => {
  return {
    tweakChrome: !!state.summary.prefs && state.summary.prefs.tweakChrome,
    OS: state.summary.OS,
  };
})(_ConversationWrapper);
