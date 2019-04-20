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

/* global Redux, Conversations, markReadInView, topMail3Pane, getMail3Pane,
          isInTab, msgHdrsArchive, Prefs, msgHdrsDelete, closeTab, startedEditing,
          msgHdrGetUri, onSave, openConversationInTabOrWindow,
          printConversation */

/* exported conversationApp */

"use strict";

const initialSummary = {
  loading: true,
  subject: "",
  canJunk: true,
  expanded: true,
  read: true,
};

function summary(state = initialSummary, action) {
  switch (action.type) {
    case "ARCHIVE_CONVERSATION": {
      if (isInTab || Prefs.operate_on_conversations) {
        msgHdrsArchive(Conversations.currentConversation.msgHdrs);
        if (!isInTab) {
          topMail3Pane(window).SetFocusThreadPane();
        }
      } else {
        msgHdrsArchive(topMail3Pane(window).gFolderDisplay.selectedMessages);
      }
      return state;
    }
    case "DELETE_CONVERSATION": {
      if (isInTab || Prefs.operate_on_conversations) {
        msgHdrsDelete(Conversations.currentConversation.msgHdrs);
        if (isInTab) {
          closeTab();
          return state;
        }
        topMail3Pane(window).SetFocusThreadPane();
      } else {
        msgHdrsDelete(topMail3Pane(window).gFolderDisplay.selectedMessages);
      }
      return state;
    }
    case "DETACH_TAB": {
      const element = document.getElementsByClassName("textarea")[0].parent();
      let willExpand = element.hasClass("expand") && startedEditing();
      // Pick _initialSet and not msgHdrs so as to enforce the invariant
      //  that the messages from _initialSet are in the current view.
      let urls =
        Conversations.currentConversation._initialSet.map(x => msgHdrGetUri(x)).join(",");
      let queryString = "?urls=" + encodeURIComponent(urls) +
        "&willExpand=" + Number(willExpand);
      // First, save the draft, and once it's saved, then move on to opening the
      // conversation in a new tab...
      onSave(() => {
        openConversationInTabOrWindow(Prefs.kStubUrl + queryString);
      });
      return state;
    }
    case "FORWARD_CONVERSATION": {
      Conversations.currentConversation.forward();
      return state;
    }
    case "TOGGLE_CONVERSATION_READ": {
      Conversations.currentConversation.read = action.read;
      if (!action.read) {
        markReadInView.disable();
      }
      return {...state, read: action.read};
    }
    case "TOGGLE_CONVERSATION_EXPANDED": {
      for (let {message} of Conversations.currentConversation.messages) {
        if (action.expanded) {
          message.expand();
        } else {
          message.collapse();
        }
      }
      return {...state, expanded: action.expanded};
    }
    case "MARK_AS_JUNK": {
      topMail3Pane(window).JunkSelectedMessages(true);
      topMail3Pane(window).SetFocusThreadPane();
      return {...state, canJunk: false};
    }
    case "OPEN_LINK": {
      getMail3Pane().messenger.launchExternalURL(action.url);
      return state;
    }
    case "PRINT_CONVERSATION": {
      printConversation();
      return state;
    }
    case "UPDATE_SUBJECT": {
      document.title = action.subject;
      return {...state, subject: action.subject, loading: false};
    }
    case "UPDATE_READ_STATUS": {
      return {...state, read: action.read};
    }
    case "UPDATE_CANJUNK_STATUS": {
      return {...state, canJunk: action.canJunk};
    }
    case "UPDATE_STATUS": {
      return {
        ...state,
        canJunk: action.canJunk,
        expanded: action.expanded,
        read: action.read,
      };
    }
    default: {
      return state;
    }
  }
}

const conversationApp = Redux.combineReducers({
  summary,
});
