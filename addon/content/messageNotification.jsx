/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { messageActions } from "./reducer-messages.js";
import { SvgIcon } from "./svgIcon.jsx";

class RemoteContentNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onAlwaysShowRemote = this.onAlwaysShowRemote.bind(this);
    this.onShowRemote = this.onShowRemote.bind(this);
  }

  onShowRemote() {
    this.props.dispatch(
      messageActions.showRemoteContent({
        id: this.props.id,
      })
    );
  }

  onAlwaysShowRemote() {
    this.props.dispatch(
      messageActions.alwaysShowRemoteContent({
        id: this.props.id,
        realFrom: this.props.realFrom,
      })
    );
  }

  render() {
    return (
      <div className="remoteContent notificationBar">
        {browser.i18n.getMessage("notification.remoteContentBlockedMsg") + " "}
        <span className="show-remote-content">
          <a className="link" onClick={this.onShowRemote}>
            {browser.i18n.getMessage("notification.showRemote")}
          </a>
          {" - "}
        </span>
        <span className="always-display">
          <a className="link" onClick={this.onAlwaysShowRemote}>
            {browser.i18n.getMessage("notification.alwaysShowRemote", [
              this.props.realFrom,
            ])}
          </a>
        </span>
      </div>
    );
  }
}

RemoteContentNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  id: PropTypes.number.isRequired,
  realFrom: PropTypes.string.isRequired,
};

class GenericSingleButtonNotification extends React.PureComponent {
  render() {
    return (
      <div className={this.props.barClassName + " notificationBar"}>
        <SvgIcon hash={this.props.iconName} />
        {this.props.notificationText}{" "}
        <span className={this.props.buttonClassName}>
          <a onClick={this.props.onButtonClick}>{this.props.buttonTitle}</a>
        </span>
      </div>
    );
  }
}

GenericSingleButtonNotification.propTypes = {
  barClassName: PropTypes.string.isRequired,
  buttonClassName: PropTypes.string.isRequired,
  hideIcon: PropTypes.bool,
  onButtonClick: PropTypes.func.isRequired,
  buttonTitle: PropTypes.string.isRequired,
  iconName: PropTypes.string.isRequired,
  notificationText: PropTypes.string.isRequired,
};

class GenericMultiButtonNotification extends React.PureComponent {
  constructor(props) {
    super(props);
  }

  onClick(actionParams) {
    this.props.dispatch(
      messageActions.notificationClick({
        msgUri: this.props.msgUri,
        notificationType: this.props.type,
        ...actionParams,
      })
    );
  }

  render() {
    return (
      <div className={this.props.barClassName + " notificationBar"}>
        <SvgIcon hash={this.props.iconName} />
        {this.props.notificationText}{" "}
        {this.props.buttons.map((button, i) => (
          <button
            className={button.classNames}
            tooltiptext={button.tooltiptext}
            key={i}
            onClick={this.onClick.bind(this, button.actionParams)}
          >
            {button.textContent}
          </button>
        ))}
      </div>
    );
  }
}

GenericMultiButtonNotification.propTypes = {
  barClassName: PropTypes.string.isRequired,
  buttons: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  hideIcon: PropTypes.bool,
  iconName: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  notificationText: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
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
      id: this.props.id,
    });
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="junkBar"
        buttonClassName="notJunk"
        buttonTitle={browser.i18n.getMessage("notification.notJunk")}
        iconName="whatshot"
        notificationText={browser.i18n.getMessage("notification.junkMsg")}
        onButtonClick={this.onClick}
      />
    );
  }
}

JunkNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  id: PropTypes.number.isRequired,
};

class OutboxNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    this.props.dispatch(messageActions.sendUnsent());
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="outboxBar"
        buttonClassName="sendUnsent"
        buttonTitle={browser.i18n.getMessage("notification.sendUnsent")}
        iconName="inbox"
        notificationText={browser.i18n.getMessage("notification.isOutboxMsg")}
        onButtonClick={this.onClick}
      />
    );
  }
}

OutboxNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
};

class PhishingNotification extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    this.props.dispatch(
      messageActions.ignorePhishing({
        id: this.props.id,
      })
    );
  }

  render() {
    return (
      <GenericSingleButtonNotification
        barClassName="phishingBar"
        buttonClassName="ignore-warning"
        buttonTitle={browser.i18n.getMessage("notification.ignoreScamWarning")}
        iconName="warning"
        notificationText={browser.i18n.getMessage("notification.scamMsg")}
        onButtonClick={this.onClick}
      />
    );
  }
}

PhishingNotification.propTypes = {
  dispatch: PropTypes.func.isRequired,
  id: PropTypes.number.isRequired,
};

export class MessageNotification extends React.PureComponent {
  render() {
    if (this.props.isPhishing) {
      return (
        <PhishingNotification
          dispatch={this.props.dispatch}
          id={this.props.id}
        />
      );
    }
    if (this.props.hasRemoteContent) {
      return (
        <RemoteContentNotification
          dispatch={this.props.dispatch}
          id={this.props.id}
          realFrom={this.props.realFrom}
        />
      );
    }
    if (this.props.canUnJunk) {
      return (
        <JunkNotification dispatch={this.props.dispatch} id={this.props.id} />
      );
    }
    if (this.props.isOutbox) {
      return <OutboxNotification dispatch={this.props.dispatch} />;
    }
    if (this.props.extraNotifications && this.props.extraNotifications.length) {
      // Only display the first notification.
      const notification = this.props.extraNotifications[0];
      return (
        <GenericMultiButtonNotification
          barClassName={notification.type + "Bar"}
          buttons={notification.buttons || []}
          iconName={notification.iconName}
          dispatch={this.props.dispatch}
          msgUri={this.props.msgUri}
          notificationText={notification.label}
          type={notification.type}
        />
      );
    }
    return null;
  }
}

MessageNotification.propTypes = {
  canUnJunk: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  extraNotifications: PropTypes.array,
  hasRemoteContent: PropTypes.bool.isRequired,
  isPhishing: PropTypes.bool.isRequired,
  isOutbox: PropTypes.bool.isRequired,
  id: PropTypes.number.isRequired,
  msgUri: PropTypes.string.isRequired,
  realFrom: PropTypes.string.isRequired,
};
