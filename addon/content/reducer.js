/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Redux, Conversations, markReadInView, topMail3Pane, getMail3Pane,
          isInTab, msgHdrsArchive, Prefs, closeTab, startedEditing,
          msgHdrGetUri, onSave, openConversationInTabOrWindow,
          printConversation, MailServices, Services */

/* exported conversationApp */

"use strict";

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  ContactHelpers: "resource://conversations/modules/contact.js",
  msgHdrsDelete: "resource://conversations/modules/stdlib/msgHdrUtils.js",
  composeMessageTo: "resource://conversations/modules/stdlib/compose.js",
  openConversationInTabOrWindow: "resource://conversations/modules/misc.js",
  MessageUtils: "resource://conversations/modules/message.js",
});

const initialAttachments = {};

const initialMessages = {};

const initialSummary = {
  loading: true,
  subject: "",
  canJunk: true,
  expanded: true,
  read: true,
};

function attachments(state = initialAttachments, action) {
  switch (action.type) {
    case "PREVIEW_ATTACHMENT": {
      MessageUtils.previewAttachment(topMail3Pane(window), action.name, action.url,
        action.isPdf, action.maybeViewable);
      return state;
    }
    case "DOWNLOAD_ALL": {
      MessageUtils.downloadAllAttachments(topMail3Pane(window), action.msgUri,
        action.attachmentDetails);
      return state;
    }
    case "DOWNLOAD_ATTACHMENT": {
      MessageUtils.downloadAttachment(topMail3Pane(window), action.msgUri,
        action.attachment);
      const msg = Conversations.currentConversation.getMessage(action.msgUri);
      msg.downloadAttachment(topMail3Pane(window), action.url);
      return state;
    }
    case "OPEN_ATTACHMENT": {
      MessageUtils.openAttachment(topMail3Pane(window), action.msgUri,
        action.attachment);
      return state;
    }
    case "SHOW_GALLERY_VIEW": {
      const kGalleryUrl = "chrome://conversations/content/gallery/index.html";

      let tabmail = topMail3Pane(window).document.getElementById("tabmail");
      tabmail.openTab("chromeTab", {
        chromePage: kGalleryUrl + "?uri=" + action.msgUri,
      });

      return state;
    }
    default: {
      return state;
    }
  }
}

function messages(state = initialMessages, action) {
  switch (action.type) {
    case "REPLACE_CONVERSATION_DETAILS": {
      return {
        ...state,
        ...action.messages,
      };
    }
    case "EDIT_DRAFT": {
      MessageUtils.editDraft(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "EDIT_AS_NEW": {
      MessageUtils.editAsNew(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "MSG_REPLY": {
      MessageUtils.reply(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "MSG_REPLY_ALL": {
      MessageUtils.replyAll(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "MSG_REPLY_LIST": {
      MessageUtils.replyList(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "MSG_FORWARD": {
      MessageUtils.forward(topMail3Pane(window), action.msgUri, action.shiftKey);
      return state;
    }
    case "MSG_ARCHIVE": {
      const msg = Conversations.currentConversation.getMessage(action.msgUri);
      msgHdrsArchive([msg._msgHdr]);
      return state;
    }
    case "MSG_DELETE": {
      const msg = Conversations.currentConversation.getMessage(action.msgUri);
      // We do this, otherwise we end up with messages in the conversation that
      //  don't have a message header, and that breaks pretty much all the
      //  assumptions...
      msg.removeFromConversation();
      return state;
    }
    case "MSG_OPEN_CLASSIC": {
      const msg = Conversations.currentConversation.getMessage(action.msgUri);
      msg.openInClassic(topMail3Pane(window));
      return state;
    }
    case "MSG_OPEN_SOURCE": {
      const msg = Conversations.currentConversation.getMessage(action.msgUri);
      msg.openInSourceView(topMail3Pane(window));
      return state;
    }
    case "MSG_STREAM_MSG": {
      // TODO: Add a call to addMsgListener
      // TODO: We need to allow for plugins here and call onMessageBeforeStreaming
      // hooks.
      // Future TODO: Can we stream the message by just assigning the url in
      // the iframe.
      let messageService = Services.mMessenger.messageServiceFromURI(action.neckoUrl.spec);
      messageService.DisplayMessage(action.msgUri + "&markRead=false", action.docshell,
                                    topMail3Pane(window).msgWindow, null, "UTF-8", {});
      return state;
    }
    case "MSG_EXPAND": {
      const newState = {...state};
      const newMsgData = [];
      for (let msg of newState.msgData) {
        const newMsg = {...msg};
        if (newMsg.msgUri == action.msgUri) {
          newMsg.expanded = action.expand;
        }
        newMsgData.push(newMsg);
      }
      newState.msgData = newMsgData;
      return newState;
    }
    default: {
      return state;
    }
  }
}

function summary(state = initialSummary, action) {
  switch (action.type) {
    case "REPLACE_CONVERSATION_DETAILS": {
      return {
        ...state,
        ...action.summary,
      };
    }
    case "ADD_CONTACT": {
      ContactHelpers.addContact(topMail3Pane(window), action.name, action.email);
      // TODO: In theory we should be updating the store so that the button can
      // then be updated to indicate this is now in the address book. However,
      // until we start getting the full conversation messages hooked up, this
      // won't be easy. As this is only a small bit of hidden UI, we can punt on
      // this for now.
      return state;
    }
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
    case "COPY_EMAIL": {
      navigator.clipboard.writeText(action.email);
      return state;
    }
    case "CREATE_FILTER": {
      topMail3Pane(window).MsgFilters(action.email, null);
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
      // TODO: Fix re-enabling composition when expanded into new tab.
      // const element = document.getElementsByClassName("textarea")[0].parent();
      // let willExpand = element.hasClass("expand") && startedEditing();
      // Pick _initialSet and not msgHdrs so as to enforce the invariant
      //  that the messages from _initialSet are in the current view.
      let urls =
        Conversations.currentConversation._initialSet.map(x => msgHdrGetUri(x)).join(",");
      let queryString = "?urls=" + encodeURIComponent(urls);// +
        // "&willExpand=" + Number(willExpand);
      // First, save the draft, and once it's saved, then move on to opening the
      // conversation in a new tab...
      // onSave(() => {
        openConversationInTabOrWindow(Prefs.kStubUrl + queryString);
      // });
      return state;
    }
    case "EDIT_CONTACT": {
      ContactHelpers.editContact(topMail3Pane(window), action.name, action.email);
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
    case "SEND_EMAIL": {
      let dest = (!action.name || action.name == action.email) ?
        action.email :
        MailServices.headerParser.makeMimeAddress(action.name, action.email);
      composeMessageTo(dest, topMail3Pane(window).gFolderDisplay.displayedFolder);
      return state;
    }
    case "SHOW_MESSAGES_INVOLVING": {
      ContactHelpers.showMessagesInvolving(topMail3Pane(window), action.name, action.email);
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
  attachments,
  messages,
  summary,
});
