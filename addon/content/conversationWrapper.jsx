/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals AttachmentMenu, ConversationHeader, ConversationFooter, MessageList,
           React, ReactRedux, PropTypes */
/* exported ConversationWrapper */

class _ConversationWrapper extends React.PureComponent {
  componentDidMount() {
    this._setHTMLAttributes();
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
      <div>
        <div className="hidden" id="tooltipContainer"></div>
        <ConversationHeader />
        <MessageList />
        <ConversationFooter />
        <AttachmentMenu />
      </div>
    );
  }
}

_ConversationWrapper.propTypes = {
  tweakChrome: PropTypes.bool.isRequired,
  OS: PropTypes.string.isRequired,
};

const ConversationWrapper = ReactRedux.connect(state => {
  return {
    tweakChrome: !!state.summary.prefs && state.summary.prefs.tweakChrome,
    OS: state.summary.OS,
  };
})(_ConversationWrapper);
