/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes */
/* exported MessageIFrame */

class MessageIFrame extends React.Component {
  componentWillReceiveProps(nextProps) {
    if (this.props.neckoUrl != nextProps.neckoUrl) {
      this.props.dispatch({
        type: "MSG_STREAM_MSG",
        docshell: this.iframe.contentWindow.docShell,
        msgUri: nextProps.msgUri,
        neckoUrl: nextProps.neckoUrl,
      });
    }
  }

  componentDidMount() {
    this.iframe.contentWindow.docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
    this.props.dispatch({
      type: "MSG_STREAM_MSG",
      docshell: this.iframe.contentWindow.docShell,
      msgUri: this.props.msgUri,
      neckoUrl: this.props.neckoUrl,
    });
  }

  shouldComponentUpdate() {
    return false;
  }

  render() {
    return (
      <iframe type="content" ref={f => this.iframe = f}/>
    );
  }
}

MessageIFrame.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgUri: PropTypes.string.isRequired,
  neckoUrl: PropTypes.object.isRequired,
};
