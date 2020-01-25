/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, Attachments, MessageHeader, MessageFooter,
           MessageIFrame, StringBundle, SpecialMessageTags, MessageTags,
           MessageDetails, MessageNotification */
/* exported Message */

class Message extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle(
      "chrome://conversations/locale/template.properties"
    );
    this.onSelected = this.onSelected.bind(this);
  }

  componentDidMount() {
    this.li.addEventListener("focus", this.onSelected, true);
    this.li.addEventListener("click", this.onSelected, true);
    this.li.addEventListener("keydown", this.onSelected, true);
    if (
      this.lastScrolledMsgUri != this.props.message.msgUri &&
      this.props.message.scrollTo
    ) {
      this.lastScrolledMsgUri = this.props.message.msgUri;
      // The header is 44px high (yes, this is harcodeadly ugly).
      window.requestAnimationFrame(() => {
        window.scrollTo(
          0,
          this.li.getBoundingClientRect().top + window.scrollY + 5 - 44
        );
        this.onSelected();
      });
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.message.expanded && !this.props.iframesLoading) {
      this.handleAutoMarkAsRead();
    } else if (!this.props.message.expanded || this.props.message.read) {
      this.removeScrollListener();
    }
    if (!this.props.message.scrollTo) {
      return;
    }
    if (
      this.lastScrolledMsgUri != this.props.message.msgUri ||
      (prevProps.iframesLoading && !this.props.iframesLoading)
    ) {
      this.lastScrolledMsgUri = this.props.message.msgUri;
      // The header is 44px high (yes, this is harcodeadly ugly).
      window.requestAnimationFrame(() => {
        window.scrollTo(
          500,
          this.li.getBoundingClientRect().top + window.scrollY + 5 - 44
        );
        this.onSelected();
      });
    }
  }

  componentWillUnmount() {
    this.li.removeEventListener("focus", this.onSelected, true);
    this.li.removeEventListener("click", this.onSelected, true);
    this.li.removeEventListener("keydown", this.onSelected, true);
    this.removeScrollListener();
  }

  removeScrollListener() {
    if (this._scrollListener) {
      document.removeEventListener("scroll", this._scrollListener, true);
      delete this._scrollListener;
    }
  }

  // Handles setting up the listeners for if we should mark as read when scrolling.
  handleAutoMarkAsRead() {
    // If we're already read, not expanded or auto read is turned off, then we
    // don't need to add listeners.
    if (
      !this.props.autoMarkAsRead ||
      !this.props.message.expanded ||
      this.props.message.read
    ) {
      this.removeScrollListener();
      return;
    }

    if (this._scrollListener) {
      return;
    }

    this._topInView = false;
    this._bottomInView = false;

    this._scrollListener = this.onScroll.bind(this);
    document.addEventListener("scroll", this._scrollListener, true);
  }

  onSelected() {
    this.props.dispatch({
      type: "MSG_SELECTED",
      msgUri: this.props.message.msgUri,
    });
  }

  onScroll() {
    const rect = this.li.getBoundingClientRect();

    if (!this._topInView) {
      const top = rect.y;
      if (top > 0 && top < window.innerHeight) {
        this._topInView = true;
      }
    }
    if (!this._bottomInView) {
      const bottom = rect.y + rect.height;
      if (bottom > 0 && bottom < window.innerHeight) {
        this._bottomInView = true;
      }
    }
    if (this._topInView && this._bottomInView) {
      this.read = true;
      this.props.dispatch({
        type: "MSG_MARK_AS_READ",
        msgUri: this.props.message.msgUri,
      });
      this.removeScrollListener();
    }
  }

  render() {
    // TODO: For printing, we used to have a container in-between the iframe
    // and attachments container. Need to figure out how to get that back in
    // and working.
    // <div class="body-container"></div>
    return (
      <li className="message" ref={li => (this.li = li)}>
        <MessageHeader
          dispatch={this.props.dispatch}
          bcc={this.props.message.bcc}
          cc={this.props.message.cc}
          date={this.props.message.date}
          detailsShowing={this.props.message.detailsShowing}
          expanded={this.props.message.expanded}
          from={this.props.message.from}
          to={this.props.message.to}
          fullDate={this.props.message.fullDate}
          msgUri={this.props.message.msgUri}
          attachments={this.props.message.attachments}
          multipleRecipients={this.props.message.multipleRecipients}
          recipientsIncludeLists={this.props.message.recipientsIncludeLists}
          inView={this.props.message.inView}
          isDraft={this.props.message.isDraft}
          shortFolderName={this.props.message.shortFolderName}
          snippet={this.props.message.snippet}
          starred={this.props.message.starred}
          tags={this.props.message.tags}
        />
        {this.props.message.expanded && this.props.message.detailsShowing && (
          <MessageDetails
            bcc={this.props.message.bcc}
            cc={this.props.message.cc}
            extraLines={this.props.message.extraLines}
            from={this.props.message.from}
            to={this.props.message.to}
            strings={this.strings}
          />
        )}
        {this.props.message.expanded && (
          <MessageNotification
            canUnJunk={
              this.props.message.isJunk && !this.props.displayingMultipleMsgs
            }
            dispatch={this.props.dispatch}
            extraNotifications={this.props.message.extraNotifications}
            hasRemoteContent={this.props.message.hasRemoteContent}
            isPhishing={this.props.message.isPhishing}
            isOutbox={this.props.message.isOutbox}
            msgUri={this.props.message.msgUri}
            realFrom={this.props.message.realFrom}
            strings={this.strings}
          />
        )}
        <div className="messageBody">
          {this.props.message.expanded && (
            <SpecialMessageTags
              canClickFolder={true}
              dispatch={this.props.dispatch}
              folderName={this.props.message.folderName}
              inView={this.props.message.inView}
              msgUri={this.props.message.msgUri}
              specialTags={this.props.message.specialTags}
              strings={this.strings}
            />
          )}
          {this.props.message.expanded && (
            <MessageTags
              dispatch={this.props.dispatch}
              expanded={true}
              msgUri={this.props.message.msgUri}
              tags={this.props.message.tags}
            />
          )}
          <MessageIFrame
            dispatch={this.props.dispatch}
            expanded={this.props.message.expanded}
            hasRemoteContent={this.props.message.hasRemoteContent}
            initialPosition={this.props.message.initialPosition}
            msgUri={this.props.message.msgUri}
            neckoUrl={this.props.message.neckoUrl}
            prefs={this.props.prefs}
            realFrom={this.props.message.realFrom}
            strings={this.strings}
          />
          {this.props.message.expanded &&
            !!this.props.message.attachments.length && (
              <Attachments
                dispatch={this.props.dispatch}
                attachments={this.props.message.attachments}
                attachmentsPlural={this.props.message.attachmentsPlural}
                msgUri={this.props.message.msgUri}
                gallery={this.props.message.gallery}
                strings={this.strings}
              />
            )}
        </div>
        {this.props.message.expanded && (
          <MessageFooter
            dispatch={this.props.dispatch}
            msgUri={this.props.message.msgUri}
            multipleRecipients={this.props.message.multipleRecipients}
            recipientsIncludeLists={this.props.message.recipientsIncludeLists}
            isDraft={this.props.message.isDraft}
          />
        )}
        {this.props.isLastMessage && this.props.message.expanded && (
          <div dir="ltr">
            <small>
              <i>
                Quick Reply is temporarily disabled due to needing more work for
                Thunderbird 68.
              </i>
            </small>
          </div>
        )}
      </li>
    );
  }
}

Message.propTypes = {
  autoMarkAsRead: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  displayingMultipleMsgs: PropTypes.bool.isRequired,
  iframesLoading: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
  isLastMessage: PropTypes.bool.isRequired,
  message: PropTypes.object.isRequired,
  prefs: PropTypes.object.isRequired,
};
