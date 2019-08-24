/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, Attachments, MessageHeader, MessageFooter,
           MessageIFrame, StringBundle, SpecialMessageTags, MessageTags */
/* exported Message */

class Message extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
  }

  componentDidMount() {
    if (this.lastScrolledMsgUri != this.props.message.msgUri &&
        this.props.message.scrollTo) {
      this.lastScrolledMsgUri = this.props.message.msgUri;
      // The header is 44px high (yes, this is harcodeadly ugly).
      window.requestAnimationFrame(() => {
        window.scrollTo(0, this.li.getBoundingClientRect().top + window.scrollY + 5 - 44);
      });
    }
  }

  componentDidUpdate(prevProps) {
    if (!this.props.message.scrollTo) {
      return;
    }
    if ((this.lastScrolledMsgUri != this.props.message.msgUri) ||
        (prevProps.iframesLoading && !this.props.iframesLoading)) {
      this.lastScrolledMsgUri = this.props.message.msgUri;
      // The header is 44px high (yes, this is harcodeadly ugly).
      window.requestAnimationFrame(() => {
        window.scrollTo(500, this.li.getBoundingClientRect().top + window.scrollY + 5 - 44);
      });
    }
  }

  render() {
    return (
      <li className="message" ref={li => this.li = li}>
        <MessageHeader
          dispatch={this.props.dispatch}
          date={this.props.message.date}
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
          tags={this.props.message.tags}/>
        <div className="messageBody">
          {this.props.message.expanded &&
            <SpecialMessageTags
              canClickFolder={true}
              dispatch={this.props.dispatch}
              folderName={this.props.message.folderName}
              inView={this.props.message.inView}
              msgUri={this.props.message.msgUri}
              strings={this.strings}/>
          }
          {this.props.message.expanded &&
            <MessageTags
              dispatch={this.props.dispatch}
              expanded={true}
              msgUri={this.props.message.msgUri}
              tags={this.props.message.tags}/>
          }
          <MessageIFrame
            dispatch={this.props.dispatch}
            expanded={this.props.message.expanded}
            msgUri={this.props.message.msgUri}
            neckoUrl={this.props.message.neckoUrl}/>
          {this.props.message.expanded && !!this.props.message.attachments.length &&
            <Attachments
              dispatch={this.props.dispatch}
              attachments={this.props.message.attachments}
              attachmentsPlural={this.props.message.attachmentsPlural}
              msgUri={this.props.message.msgUri}
              gallery={this.props.message.gallery}/>
          }
        </div>
        {this.props.message.expanded &&
          <MessageFooter
            dispatch={this.props.dispatch}
            msgUri={this.props.message.msgUri}
            multipleRecipients={this.props.message.multipleRecipients}
            recipientsIncludeLists={this.props.message.recipientsIncludeLists}
            isDraft={this.props.message.isDraft}/>
        }
      </li>
    );
  }
}

Message.propTypes = {
  dispatch: PropTypes.func.isRequired,
  iframesLoading: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
  message: PropTypes.object.isRequired,
};
