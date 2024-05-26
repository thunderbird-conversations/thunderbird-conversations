/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { summaryActions } from "../../reducer/reducerSummary.mjs";

/**
 * Handles display for the footer of the conversation.
 */
class _ConversationFooter extends React.PureComponent {
  constructor(props) {
    super(props);
    this.forwardConversation = this.forwardConversation.bind(this);
    this.printConversation = this.printConversation.bind(this);
  }

  forwardConversation() {
    this.props.dispatch(summaryActions.forwardConversation());
  }

  printConversation() {
    this.props.dispatch(summaryActions.printConversation());
  }

  render() {
    return React.createElement(
      "div",
      { className: "bottom-links" },
      React.createElement(
        "a",
        { className: "link", onClick: this.forwardConversation },
        browser.i18n.getMessage("message.forwardConversation")
      ),
      " - ",
      React.createElement(
        "a",
        { className: "link", onClick: this.printConversation },
        browser.i18n.getMessage("message.printConversation")
      )
    );
  }
}

_ConversationFooter.propTypes = {
  dispatch: PropTypes.func.isRequired,
};

export const ConversationFooter = ReactRedux.connect()(_ConversationFooter);
