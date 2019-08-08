/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, ReactRedux, PropTypes, StringBundle */
/* exported ConversationHeader */

const LINKS_REGEX = /((\w+):\/\/[^<>()'"\s]+|www(\.[-\w]+){2,})/;

class LinkifiedSubject extends React.PureComponent {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
  }

  handleClick(event) {
    this.props.dispatch({
      type: "OPEN_LINK",
      url: event.target.title,
    });
    event.preventDefault();
  }

  render() {
    let subject = this.props.subject;
    if (this.props.loading) {
      subject = this.props.strings.get("stub.loading");
    } else if (!subject) {
      subject = this.props.strings.get("stub.no.subject");
    }

    if (LINKS_REGEX.test(this.props.subject)) {
      let contents = [];
      let text = subject;
      while (text && LINKS_REGEX.test(text)) {
        let matches = LINKS_REGEX.exec(text);
        let [pre, ...post] = text.split(matches[1]);
        let link = <a href={matches[1]} title={matches[1]} className="link" onClick={this.handleClick}>{matches[1]}</a>;
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
        <div className="subject boxFlex" title={this.props.subject}>
          <span>
            {contents}
          </span>
        </div>
      );
    }

    return (
      <div className="subject boxFlex" title={this.props.subject}>
        {this.props.subject}
      </div>
    );
  }
}

LinkifiedSubject.propTypes = {
  dispatch: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  strings: PropTypes.object.isRequired,
  subject: PropTypes.string.isRequired,
};

class _ConversationHeader extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle("chrome://conversations/locale/pages.properties");
    this.archiveToolbar = this.archiveToolbar.bind(this);
    this.delete = this.delete.bind(this);
    this.detachTab = this.detachTab.bind(this);
    this.expandCollapse = this.expandCollapse.bind(this);
    this.junkConversation = this.junkConversation.bind(this);
    this.toggleRead = this.toggleRead.bind(this);
  }

  archiveToolbar(event) {
    this.props.dispatch({
      type: "ARCHIVE_CONVERSATION",
    });
  }

  delete(event) {
    this.props.dispatch({
      type: "DELETE_CONVERSATION",
    });
  }

  /**
   * This function gathers various information, encodes it in a URL query
   * string, and then opens a regular chrome tab that contains our
   * conversation.
   */
  detachTab(event) {
    this.props.dispatch({
      type: "DETACH_TAB",
    });
  }

  expandCollapse(event) {
    this.props.dispatch({
      type: "TOGGLE_CONVERSATION_EXPANDED",
      expanded: !this.props.expanded,
    });
  }

  junkConversation(event) {
    // This callback is only activated when the conversation is not a
    //  conversation in a tab AND there's only one message in the conversation,
    //  i.e. the currently selected message
    this.props.dispatch({
      type: "MARK_AS_JUNK",
    });
  }

  // Mark the current conversation as read/unread. The conversation driver
  //  takes care of setting the right class on us whenever the state
  //  changes...
  toggleRead(event) {
    this.props.dispatch({
      type: "TOGGLE_CONVERSATION_READ",
      read: !this.props.read,
    });
  }

  render() {
    return (
      <div className="conversationHeaderWrapper">
        <div className="conversationHeader hbox">
          <LinkifiedSubject dispatch={this.props.dispatch}
                            loading={this.props.loading}
                            strings={this.strings}
                            subject={this.props.subject}/>
          <div className="actions">
            <button className="button-flat"
                    title={this.strings.get("stub.trash.tooltip")}
                    onClick={this.delete}>
              <svg className="icon"
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                   xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#delete"></use>
              </svg>
            </button>
            <button className="button-flat"
                    title={this.strings.get("stub.archive.tooltip")}
                    onClick={this.archiveToolbar}>
              <svg className="icon"
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                   xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#archive"></use>
              </svg>
            </button>
            {this.props.canJunk &&
              <button className="button-flat junk-button"
                      title={this.strings.get("stub.junk.tooltip")}
                      onClick={this.junkConversation}>
                <svg className="icon"
                     viewBox="0 0 24 24"
                     xmlns="http://www.w3.org/2000/svg"
                     xmlnsXlink="http://www.w3.org/1999/xlink">
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#whatshot"></use>
                </svg>
              </button>
            }
            <button className="button-flat"
                    title={this.strings.get("stub.expand.tooltip")}
                    onClick={this.expandCollapse}>
              <svg className={`icon expand ${this.props.expanded ? "collapse" : ""}`}
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                   xmlnsXlink="http://www.w3.org/1999/xlink">
                <use className="expand-more"
                     xlinkHref="chrome://conversations/skin/material-icons.svg#expand_more"></use>
                <use className="expand-less"
                     xlinkHref="chrome://conversations/skin/material-icons.svg#expand_less"></use>
              </svg>
            </button>
            <button className="button-flat"
                    title={this.strings.get("stub.read.tooltip")}
                    onClick={this.toggleRead}>
              <svg className={`icon read ${this.props.read ? "" : "unread"}`}
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                   xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#new"></use>
              </svg>
            </button>
            <button className="button-flat"
                    title={this.strings.get("stub.detach.tooltip2")}
                    onClick={this.detachTab}>
              <svg className="icon"
                   viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg"
                   xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#open_in_new"></use>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

_ConversationHeader.propTypes = {
  canJunk: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  read: PropTypes.bool.isRequired,
  subject: PropTypes.string.isRequired,
};

const ConversationHeader = ReactRedux.connect(state => state.summary)(_ConversationHeader);
