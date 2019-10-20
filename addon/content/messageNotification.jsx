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
          <a className="link" onClick={this.onShowRemote}>
            {this.props.strings.get("showRemote")}
          </a>
          {" - "}
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

class GenericSingleButtonNotification extends React.PureComponent {
  render() {
    return (
      <div className={this.props.barClassName + " notificationBar"}>
        <svg
          className="icon"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
        >
          <use
            xlinkHref={`chrome://conversations/skin/material-icons.svg#${this.props.iconName}`}
          ></use>
        </svg>
        {this.props.notificationText}{" "}
        <span className="notJunk">
          <a onClick={this.props.onButtonClick}>{this.props.buttonTitle}</a>
        </span>
      </div>
    );
  }
}

GenericSingleButtonNotification.propTypes = {
  barClassName: PropTypes.string.isRequired,
  buttonClassName: PropTypes.string.isRequired,
  onButtonClick: PropTypes.func.isRequired,
  buttonTitle: PropTypes.string.isRequired,
  iconName: PropTypes.string.isRequired,
  notificationText: PropTypes.string.isRequired,
};

class JunkNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    this.props.dispatch({
      type: "MARK_AS_JUNK",
      isJunk: false,
      msgUri: this.props.msgUri,
    });
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="junkBar"
        buttonClassName="notJunk"
        buttonTitle={this.props.strings.get("notJunk")}
        iconName="whatshot"
        notificationText={this.props.strings.get("junk")}
        onButtonClick={this.onClick}
      />
    );
  }
}

JunkNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgUri: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
};

class OutboxNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    this.props.dispatch({
      type: "SEND_UNSENT",
    });
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="outboxBar"
        buttonClassName="sendUnsent"
        buttonTitle={this.props.strings.get("sendUnsent")}
        iconName="inbox"
        notificationText={this.props.strings.get("isOutbox")}
        onButtonClick={this.onClick}
      />
    );
  }
}

OutboxNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  strings: PropTypes.object.isRequired,
};

class PhishingNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    this.props.dispatch({
      type: "MSG_IGNORE_PHISHING",
      msgUri: this.props.msgUri,
    });
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="phishingBar"
        buttonClassName="ignore-warning"
        buttonTitle={this.props.strings.get("ignoreWarning")}
        iconName="warning"
        notificationText={this.props.strings.get("scam")}
        onButtonClick={this.onClick}
      />
    );
  }
}

PhishingNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  msgUri: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
};

class MessageNotification extends React.PureComponent {
  render() {
    if (this.props.isPhishing) {
      return (
        <PhishingNotification
          dispatch={this.props.dispatch}
          msgUri={this.props.msgUri}
          strings={this.props.strings}
        />
      );
    }
    if (this.props.hasRemoteContent) {
      return (
        <RemoteContentNotification
          dispatch={this.props.dispatch}
          msgUri={this.props.msgUri}
          realFrom={this.props.realFrom}
          strings={this.props.strings}
        />
      );
    }
    if (this.props.canUnJunk) {
      return (
        <JunkNotification
          dispatch={this.props.dispatch}
          msgUri={this.props.msgUri}
          strings={this.props.strings}
        />
      );
    }
    if (this.props.isOutbox) {
      return (
        <OutboxNotification
          dispatch={this.props.dispatch}
          strings={this.props.strings}
        />
      );
    }
    return null;
  }
}

MessageNotification.propTypes = {
  canUnJunk: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  hasRemoteContent: PropTypes.bool.isRequired,
  isPhishing: PropTypes.bool.isRequired,
  isOutbox: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  realFrom: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
};
