/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* globals React, ReactDOM, Conversations, MailServices, printConversation
           StringBundle, isInTab, Prefs, topMail3Pane, msgHdrsDelete, closeTab,
           msgHdrsArchive, markReadInView */
/* exported ConversationHeader */

class ConversationHeader extends React.Component {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/pages.properties");
    this.state = {
      expanded: true,
      canJunk: true,
      read: true,
    };
    this.archiveToolbar = this.archiveToolbar.bind(this);
    this.delete = this.delete.bind(this);
    this.detachTab = this.detachTab.bind(this);
    this.expandCollapse = this.expandCollapse.bind(this);
    this.junkConversation = this.junkConversation.bind(this);
    this.toggleRead = this.toggleRead.bind(this);
  }

  archiveToolbar(event) {
    if (isInTab || Prefs.operate_on_conversations) {
      msgHdrsArchive(Conversations.currentConversation.msgHdrs);
      if (!isInTab) {
        topMail3Pane(window).SetFocusThreadPane(event);
      }
    } else {
      msgHdrsArchive(topMail3Pane(window).gFolderDisplay.selectedMessages);
    }
  }

  delete(event) {
    if (isInTab || Prefs.operate_on_conversations) {
      msgHdrsDelete(Conversations.currentConversation.msgHdrs);
      if (isInTab) {
        closeTab();
      }
      topMail3Pane(window).SetFocusThreadPane(event);
    } else {
      msgHdrsDelete(topMail3Pane(window).gFolderDisplay.selectedMessages);
    }
  }

  /**
   * This function gathers various information, encodes it in a URL query
   * string, and then opens a regular chrome tab that contains our
   * conversation.
   */
  detachTab(event) {
    let willExpand = $("textarea").parent().hasClass("expand") && startedEditing();
    // Pick _initialSet and not msgHdrs so as to enforce the invariant
    //  that the messages from _initialSet are in the current view.
    let urls =
      Conversations.currentConversation._initialSet.map(x => msgHdrGetUri(x)).join(",");
    let queryString = "?urls="+encodeURIComponent(urls)
      +"&willExpand="+Number(willExpand);
    // First, save the draft, and once it's saved, then move on to opening the
    // conversation in a new tab...
    onSave(function () {
      openConversationInTabOrWindow(Prefs.kStubUrl+queryString);
    });
  }

  expandCollapse(event) {
    if (this.state.expanded) {
      for (let { message } of Conversations.currentConversation.messages) {
        message.collapse();
      }
      this.setState({expanded: false});
    } else {
      for (let { message } of Conversations.currentConversation.messages) {
        message.expand();
      }
      this.setState({expanded: true});
    }
  }

  junkConversation(event) {
    // This callback is only activated when the conversation is not a
    //  conversation in a tab AND there's only one message in the conversation,
    //  i.e. the currently selected message
    topMail3Pane(window).JunkSelectedMessages(true);
    this.setState({canJunk: false});
    topMail3Pane(window).SetFocusThreadPane(event);
  }

  // Mark the current conversation as read/unread. The conversation driver
  //  takes care of setting the right class on us whenever the state
  //  changes...
  toggleRead(event) {
    let read = !this.state.read;
    Conversations.currentConversation.read = read;
    if (!read) {
      markReadInView.disable();
    }
    this.setState({
      read,
    });
  }

  render() {
    return (
      <div className="conversationHeader hbox">
        <div className="subject boxFlex">{this.strings.get("stub.loading")}</div>
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
          {this.state.canJunk &&
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
            <svg className={`icon expand ${this.state.expanded ? "collapse" : ""}`}
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
            <svg className={`icon read ${this.state.read ? "" : "unread"}`}
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
    );
  }
}
