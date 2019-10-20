/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ReactRedux, StringBundle */
/* exported ConversationFooter */

class _ConversationFooter extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle(
      "chrome://conversations/locale/pages.properties"
    );
    this.forwardConversation = this.forwardConversation.bind(this);
    this.printConversation = this.printConversation.bind(this);
  }

  forwardConversation() {
    this.props.dispatch({
      type: "FORWARD_CONVERSATION",
    });
  }

  printConversation() {
    this.props.dispatch({
      type: "PRINT_CONVERSATION",
    });
  }

  render() {
    return (
      <div className="bottom-links">
        <a
          className="link"
          href="javascript:"
          onClick={this.forwardConversation}
        >
          {this.strings.get("stub.forward.tooltip")}
        </a>{" "}
        –{" "}
        <a className="link" href="javascript:" onClick={this.printConversation}>
          {this.strings.get("stub.print.tooltip")}
        </a>
      </div>
    );
  }
}

_ConversationFooter.propTypes = {
  dispatch: PropTypes.func.isRequired,
};

const ConversationFooter = ReactRedux.connect()(_ConversationFooter);
