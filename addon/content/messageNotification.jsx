/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React */
/* exported MessageNotification */

class RemoteContentNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onAlwaysShowRemote = this.onAlwaysShowRemote.bind(this);
    this.onShowRemote = this.onShowRemote.bind(this);
  }

  onShowRemote() {
    this.props.dispatch({
      type: "MSG_SHOW_REMOTE_CONTENT",
      msgUri: this.props.msgUri,
    });
  }

  onAlwaysShowRemote() {
    this.props.dispatch({
      type: "MSG_ALWAYS_SHOW_REMOTE_CONTENT",
      realFrom: this.props.realFrom,
      msgUri: this.props.msgUri,
    });
  }

  render() {
    return (
      <div className="remoteContent notificationBar">
        {this.props.strings.get("remoteContentBlocked") + " "}
        <span className="show-remote-content">
          <a className="link" onClick={this.onShowRemote}>{this.props.strings.get("showRemote")}</a>{" - "}
        </span>
        <span className="always-display">
          <a className="link" onClick={this.onAlwaysShowRemote}>
            {this.props.strings.get("alwaysShowRemote", [this.props.realFrom])}
          </a>
        </span>
      </div>
    );
  }
}

RemoteContentNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgUri: PropTypes.string.isRequired,
  realFrom: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
};

class MessageNotification extends React.PureComponent {
  render() {
    if (this.props.hasRemoteContent) {
      return (
        <RemoteContentNotification
          dispatch={this.props.dispatch}
          msgUri={this.props.msgUri}
          realFrom={this.props.realFrom}
          strings={this.props.strings}/>
      );
    }
    return null;
  }
}

MessageNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  hasRemoteContent: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  realFrom: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
};
