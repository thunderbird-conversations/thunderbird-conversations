/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { messageActions } from "../../reducer/reducerMessages.js";
import { summaryActions } from "../../reducer/reducerSummary.js";
import { SvgIcon } from "../svgIcon.mjs";

const LINKS_REGEX = /((\w+):\/\/[^<>()'"\s]+|www(\.[-\w]+){2,})/;

/**
 * Handles inserting links into the subject of a message.
 */
class LinkifiedSubject extends React.PureComponent {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick(event) {
    this.props.dispatch(summaryActions.openLink({ url: event.target.title }));
    event.preventDefault();
  }

  render() {
    let subject = this.props.subject;
    if (this.props.loading) {
      subject = browser.i18n.getMessage("message.loading");
    } else if (!subject) {
      subject = browser.i18n.getMessage("message.noSubject");
    } else if (LINKS_REGEX.test(subject)) {
      let contents = [];
      let text = subject;
      let i = 0;
      while (text && LINKS_REGEX.test(text)) {
        let matches = LINKS_REGEX.exec(text);
        let [pre, ...post] = text.split(matches[1]);
        let link = (
          <a
            href={matches[1]}
            title={matches[1]}
            className="link"
            onClick={this.handleClick}
            key={i++}
          >
            {matches[1]}
          </a>
        );
        if (pre) {
          contents.push(pre);
        }
        contents.push(link);
        text = post.join(matches[1]);
      }
      if (text) {
        contents.push(text);
      }

      return (
        <div className="subject" title={subject}>
          <span>{contents}</span>
        </div>
      );
    }

    return (
      <div className="subject" title={subject}>
        {subject}
      </div>
    );
  }
}

LinkifiedSubject.propTypes = {
  dispatch: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  subject: PropTypes.string.isRequired,
};

/**
 * Handles display for the header of the conversation.
 */
class _ConversationHeader extends React.PureComponent {
  constructor(props) {
    super(props);
    this.archiveToolbar = this.archiveToolbar.bind(this);
    this.delete = this.delete.bind(this);
    this.detachTab = this.detachTab.bind(this);
    this.expandCollapse = this.expandCollapse.bind(this);
    this.junkConversation = this.junkConversation.bind(this);
    this.toggleRead = this.toggleRead.bind(this);
  }

  archiveToolbar(event) {
    this.props.dispatch(messageActions.archiveConversation());
  }

  delete(event) {
    this.props.dispatch(messageActions.deleteConversation());
  }

  /**
   * This function gathers various information, encodes it in a URL query
   * string, and then opens a regular chrome tab that contains our
   * conversation.
   *
   * @param {Event} event
   */
  detachTab(event) {
    this.props.dispatch(messageActions.detachTab());
  }

  get areSomeMessagesCollapsed() {
    return !this.props.msgData?.some((msg) => msg.expanded);
  }

  get areSomeMessagesUnread() {
    return this.props.msgData?.some((msg) => !msg.read);
  }

  get canJunk() {
    // TODO: Disable if in just a new tab? (e.g. double-click)
    // as per old comment:
    // We can never junk a conversation in a new tab, because the junk
    // command only operates on selected messages, and we're not in a
    // 3pane context anymore.

    return (
      this.props.msgData &&
      this.props.msgData.length <= 1 &&
      this.props.msgData.some((msg) => !msg.isJunk)
    );
  }

  expandCollapse(event) {
    this.props.dispatch(
      messageActions.toggleConversationExpanded({
        expand: this.areSomeMessagesCollapsed,
      })
    );
  }

  junkConversation(event) {
    // This callback is only activated when the conversation is not a
    //  conversation in a tab AND there's only one message in the conversation,
    //  i.e. the currently selected message
    this.props.dispatch(
      messageActions.markAsJunk({
        id: this.props.msgData[0].id,
        isJunk: true,
      })
    );
  }

  // Mark the current conversation as read/unread. The conversation driver
  //  takes care of setting the right class on us whenever the state
  //  changes...
  toggleRead(event) {
    this.props.dispatch(
      messageActions.toggleConversationRead({
        read: this.areSomeMessagesUnread,
      })
    );
  }

  render() {
    document.title = this.props.subject;
    return (
      <div className="conversationHeaderWrapper">
        <div className="conversationHeader">
          <LinkifiedSubject
            dispatch={this.props.dispatch}
            loading={this.props.loading}
            subject={this.props.subject}
          />
          <div className="actions">
            <button
              className="button-flat"
              title={browser.i18n.getMessage("message.detach.tooltip")}
              onClick={this.detachTab}
            >
              <SvgIcon ariaHidden={true} hash={"open_in_new"} />
            </button>
            <button
              className={`button-flat ${
                this.areSomeMessagesUnread ? "unread" : ""
              }`}
              title={browser.i18n.getMessage("message.read.tooltip")}
              onClick={this.toggleRead}
            >
              <SvgIcon ariaHidden={true} hash={"new"} />
            </button>
            <button
              className="button-flat"
              title={browser.i18n.getMessage("message.expand.tooltip")}
              onClick={this.expandCollapse}
            >
              <svg
                className={`icon expand ${
                  this.areSomeMessagesCollapsed ? "" : "collapse"
                }`}
                aria-hidden={true}
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
              >
                <use
                  className="expand-more"
                  xlinkHref="icons/material-icons.svg#expand_more"
                ></use>
                <use
                  className="expand-less"
                  xlinkHref="icons/material-icons.svg#expand_less"
                ></use>
              </svg>
            </button>
            {this.canJunk && (
              <button
                className="button-flat junk-button"
                title={browser.i18n.getMessage("message.junk.tooltip")}
                onClick={this.junkConversation}
              >
                <SvgIcon ariaHidden={true} hash={"whatshot"} />
              </button>
            )}
            <button
              className="button-flat"
              title={browser.i18n.getMessage("message.archive.tooltip")}
              onClick={this.archiveToolbar}
            >
              <SvgIcon ariaHidden={true} hash={"archive"} />
            </button>
            <button
              className="button-flat"
              title={browser.i18n.getMessage("message.trash.tooltip")}
              onClick={this.delete}
            >
              <SvgIcon ariaHidden={true} hash={"delete"} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}

_ConversationHeader.propTypes = {
  dispatch: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  subject: PropTypes.string.isRequired,
  msgData: PropTypes.array.isRequired,
};

export const ConversationHeader = ReactRedux.connect((state) => {
  return {
    loading: state.summary.loading,
    subject: state.summary.subject,
    msgData: state.messages.msgData,
  };
})(_ConversationHeader);
