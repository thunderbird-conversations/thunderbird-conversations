/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals AttachmentMenu, ConversationHeader, ConversationFooter, MessageList,
           React */
/* exported ConversationWrapper */

class ConversationWrapper extends React.PureComponent {
  render() {
    return (
      <div>
        <div className="hidden" id="tooltipContainer"></div>
        <ConversationHeader/>
        <MessageList/>
        <ConversationFooter/>
        <AttachmentMenu/>
      </div>
    );
  }
}
