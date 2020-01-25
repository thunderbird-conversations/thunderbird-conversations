/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, MessageHeaderOptions, StringBundle, MessageTags
           SpecialMessageTags, ContactDetail */
/* exported MessageHeader */

class Fade extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      fadeIn: false,
      fadeOut: false,
    };
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.trigger && this.props.trigger) {
      let stateUpdate = {};
      if (this.fadeOutTimeout) {
        clearTimeout(this.fadeOutTimeout);
        delete this.fadeOutTimeout;
        if (this.state.fadeOut) {
          stateUpdate.fadeOut = false;
        }
        // Since we're already showing the tooltip, don't bother
        // with fading it in again.
        this.setState({
          fadeIn: false,
          fadeOut: false,
        });
        return;
      }
      stateUpdate.fadeIn = true;
      this.setState(stateUpdate);
      this.fadeInTimeout = setTimeout(() => {
        this.setState({ fadeIn: false });
        delete this.fadeInTimeout;
      }, 400);
    } else if (prevProps.trigger && !this.props.trigger) {
      let stateUpdate = {};
      if (this.fadeInTimeout) {
        clearTimeout(this.fadeInTimeout);
        delete this.fadeInTimeout;
      }
      stateUpdate.fadeOut = true;
      this.setState(stateUpdate);
      this.fadeOutTimeout = setTimeout(() => {
        this.setState({ fadeOut: false });
        delete this.fadeOutTimeout;
      }, 400);
    }
  }

  componentWillUnmount() {
    if (this.fadeInTimeout) {
      clearTimeout(this.fadeInTimeout);
      delete this.fadeInTimeout;
    }
    if (this.fadeOutTimeout) {
      clearTimeout(this.fadeOutTimeout);
      delete this.fadeOutTimeout;
    }
  }

  render() {
    if (this.props.trigger || this.state.fadeOut) {
      let transition = this.state.fadeIn ? "transition-in" : "";
      if (!transition && this.state.fadeOut) {
        transition = "transition-out";
      }
      return <span className={transition}>{this.props.children}</span>;
    }
    return null;
  }
}

Fade.propTypes = {
  children: PropTypes.object.isRequired,
  trigger: PropTypes.bool.isRequired,
};

class ContactLabel extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onMouseOver = this.onMouseOver.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    this.state = {
      hover: false,
    };
  }

  onMouseOver(event) {
    if (this.fadeOutTimeout) {
      clearTimeout(this.fadeOutTimeout);
      delete this.fadeOutTimeout;
      this.setState({ hover: true });
      return;
    }
    this.timeout = setTimeout(() => {
      this.setState({ hover: true });
      delete this.timeout;
    }, 400);
  }

  onMouseOut(event) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      delete this.timeout;
    }
    this.fadeOutTimeout = setTimeout(() => {
      this.setState({ hover: false });
      delete this.fadeOutTimeout;
    }, 400);
  }

  componentWillUnmount() {
    if (this.fadeOutTimeout) {
      clearTimeout(this.fadeOutTimeout);
      delete this.fadeOutTimeout;
    }
  }

  render() {
    return (
      <span
        className={this.props.className}
        onMouseOver={this.onMouseOver}
        onMouseOut={this.onMouseOut}
        ref={s => (this.span = s)}
      >
        <Fade trigger={this.state.hover}>
          <ContactDetail
            parentSpan={this.span}
            name={this.props.contact.name}
            email={this.props.contact.displayEmail}
            realEmail={this.props.contact.email}
            avatar={this.props.contact.avatar}
            hasCard={this.props.contact.hasCard}
          />
        </Fade>
        <span>{this.props.separator}</span>
        <span className="tooltipWrapper contact">
          <span
            className="contactName"
            name={this.props.contact.name}
            email={this.props.contact.displayEmail}
            realemail={this.props.contact.email}
            avatar={this.props.contact.avatar}
          >
            {this.props.detailView && this.props.contact.hasCard && "\u2605 "}
            {this.props.contact.name.trim()}
            {this.props.contact.extra && (
              <label
                xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
                crop="center"
                className="contactExtra"
                value={`(${this.props.contact.extra})`}
              />
            )}
            {!this.props.detailView && this.props.contact.displayEmail && (
              <span className="smallEmail">
                {" "}
                &lt;{this.props.contact.displayEmail.trim()}&gt;
              </span>
            )}
            {this.props.detailView && this.props.contact.email && (
              <span className="smallEmail">
                {" "}
                &lt;{this.props.contact.email.trim()}&gt;
              </span>
            )}
            {this.props.detailView && <br />}
          </span>
        </span>
      </span>
    );
  }
}

ContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  detailView: PropTypes.bool.isRequired,
  separator: PropTypes.string.isRequired,
};

class MessageHeader extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClickHeader = this.onClickHeader.bind(this);
    this.onClickStar = this.onClickStar.bind(this);
    this.strings = new StringBundle(
      "chrome://conversations/locale/template.properties"
    );
  }

  onClickHeader() {
    this.props.dispatch({
      type: "MSG_EXPAND",
      expand: !this.props.expanded,
      msgUri: this.props.msgUri,
    });
    if (!this.props.expanded) {
      this.props.dispatch({
        type: "MARK_AS_READ",
        expand: !this.props.expanded,
        msgUri: this.props.msgUri,
      });
    }
  }

  onClickStar(event) {
    event.stopPropagation();
    event.preventDefault();
    this.props.dispatch({
      type: "MSG_STAR",
      msgUri: this.props.msgUri,
      star: !this.props.starred,
    });
  }

  _getSeparator(index, length) {
    if (index == 0) {
      return "";
    }
    if (index < length - 1) {
      return this.strings.get("sepComma");
    }
    return this.strings.get("sepAnd");
  }

  render() {
    const allTo = [...this.props.to, ...this.props.cc, ...this.props.bcc];
    // TODO: Maybe insert this after contacts but before snippet:
    // <span class="bzTo"> {{str "at"}} {{bugzillaUrl}}</span>
    return (
      <div
        className={
          "messageHeader hbox" + (this.props.expanded ? " expanded" : "")
        }
        onClick={this.onClickHeader}
      >
        <div className="shrink-box">
          <div
            className={"star" + (this.props.starred ? " starred" : "")}
            onClick={this.onClickStar}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
            >
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#star"></use>
            </svg>
          </div>
          {this.props.from.avatarIsDefault ? (
            <abbr
              className="contactInitials"
              style={this.props.from.colorStyle}
            >
              {this.props.from.initials}
            </abbr>
          ) : (
            <span
              className="contactAvatar"
              style={{ backgroundImage: `url('${this.props.from.avatar}')` }}
            >
              {"\u00a0"}
            </span>
          )}{" "}
          <ContactLabel
            className="author"
            contact={this.props.from}
            detailView={false}
          />
          {this.props.expanded &&
            !this.props.detailsShowing &&
            this.strings.get("to") + " "}
          {this.props.expanded &&
            !this.props.detailsShowing &&
            allTo.map((contact, index) => (
              <ContactLabel
                className="to"
                contact={contact}
                detailView={false}
                key={index}
                separator={this._getSeparator(index, allTo.length)}
              />
            ))}
          {!this.props.expanded && (
            <span className="snippet">
              <MessageTags
                onTagsChange={tags => {
                  this.props.dispatch({
                    type: "MSG_SET_TAGS",
                    msgUri: this.props.msgUri,
                    tags,
                  });
                }}
                expanded={false}
                tags={this.props.tags}
              />
              <SpecialMessageTags
                onTagClick={(event, tag) => {
                  this.props.dispatch({
                    type: "TAG_CLICK",
                    event,
                    msgUri: this.props.msgUri,
                    details: tag.details,
                  });
                }}
                folderName={this.props.shortFolderName}
                inView={this.props.inView}
                strings={this.strings}
                specialTags={this.props.specialTags}
              />
              {this.props.snippet}
            </span>
          )}
        </div>
        <MessageHeaderOptions
          dispatch={this.props.dispatch}
          date={this.props.date}
          detailsShowing={this.props.detailsShowing}
          expanded={this.props.expanded}
          fullDate={this.props.fullDate}
          msgUri={this.props.msgUri}
          attachments={this.props.attachments}
          multipleRecipients={this.props.multipleRecipients}
          recipientsIncludeLists={this.props.recipientsIncludeLists}
          isDraft={this.props.isDraft}
        />
      </div>
    );
  }
}

MessageHeader.propTypes = {
  bcc: PropTypes.array.isRequired,
  cc: PropTypes.array.isRequired,
  dispatch: PropTypes.func.isRequired,
  date: PropTypes.string.isRequired,
  detailsShowing: PropTypes.bool.isRequired,
  expanded: PropTypes.bool.isRequired,
  from: PropTypes.object.isRequired,
  fullDate: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  attachments: PropTypes.array.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  inView: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
  shortFolderName: PropTypes.string.isRequired,
  snippet: PropTypes.string.isRequired,
  starred: PropTypes.bool.isRequired,
  tags: PropTypes.array.isRequired,
  to: PropTypes.array.isRequired,
  specialTags: PropTypes.array.isRequired,
};
