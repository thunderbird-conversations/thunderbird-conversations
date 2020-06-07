/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Redux, Conversations, getMail3Pane */
// eslint-disable-next-line no-redeclare
/* global browser:true */
/* exported conversationApp, attachmentActions, messageActions, summaryActions,
            initialize */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  Conversation: "chrome://conversations/content/modules/conversation.js",
  MessageUtils: "chrome://conversations/content/modules/message.js",
  Prefs: "chrome://conversations/content/modules/prefs.js",
  topMail3Pane: "chrome://conversations/content/modules/misc.js",
});

let browser;

async function initialize() {
  // This provides simulation for the WebExtension environment whilst we're still
  // being loaded in a privileged process.
  browser = await BrowserSim.getBrowserAsync();
}

let oldPrint = window.print;

function printConversation(event) {
  for (let { message: m } of Conversations.currentConversation.messages) {
    m.dumpPlainTextForPrinting();
  }
  oldPrint();
}

window.print = printConversation;

const initialMessages = {
  msgData: [],
};

const initialSummary = {
  browserForegroundColor: "#000000",
  browserBackgroundColor: "#FFFFFF",
  conversation: null,
  defaultFontSize: 15,
  // TODO: What is loading used for?
  loading: true,
  iframesLoading: 0,
  isInTab: false,
  OS: "win",
  tenPxFactor: 0.7,
  subject: "",
  windowId: null,
};

function modifyOnlyMsg(currentState, msgUri, modifier) {
  const newState = { ...currentState };
  const newMsgData = [];
  for (let i = 0; i < currentState.msgData.length; i++) {
    if (currentState.msgData[i].msgUri == msgUri) {
      newMsgData.push(modifier({ ...currentState.msgData[i] }));
    } else {
      newMsgData.push(currentState.msgData[i]);
    }
  }
  newState.msgData = newMsgData;
  return newState;
}

function modifyOnlyMsgId(currentState, id, modifier) {
  const newState = { ...currentState };
  const newMsgData = [];
  for (let i = 0; i < currentState.msgData.length; i++) {
    if (currentState.msgData[i].id == id) {
      newMsgData.push(modifier({ ...currentState.msgData[i] }));
    } else {
      newMsgData.push(currentState.msgData[i]);
    }
  }
  newState.msgData = newMsgData;
  return newState;
}

const attachmentActions = {
  previewAttachment({ name, url, isPdf, maybeViewable }) {
    return async (dispatch, getState) => {
      if (maybeViewable) {
        // Can't use browser.tabs.create because imap://user@bar/ is an
        // illegal url.
        browser.conversations.createTab({
          url,
          type: "contentTab",
          windowId: getState().summary.windowId,
        });
      }
      if (isPdf) {
        browser.conversations.createTab({
          url:
            "chrome://conversations/content/pdfviewer/wrapper.xhtml?uri=" +
            encodeURIComponent(url) +
            "&name=" +
            encodeURIComponent(name),
          type: "chromeTab",
          windowId: getState().summary.windowId,
        });
      }
    };
  },
  downloadAll({ msgUri, attachmentDetails }) {
    return async () => {
      MessageUtils.downloadAllAttachments(
        topMail3Pane(window),
        msgUri,
        attachmentDetails
      );
    };
  },
  downloadAttachment({ msgUri, attachment }) {
    return async () => {
      MessageUtils.downloadAttachment(topMail3Pane(window), msgUri, attachment);
    };
  },
  openAttachment({ msgUri, attachment }) {
    return async () => {
      MessageUtils.openAttachment(topMail3Pane(window), msgUri, attachment);
    };
  },
  detachAttachment({ msgUri, attachment, shouldSave }) {
    return async () => {
      MessageUtils.detachAttachment(
        topMail3Pane(window),
        msgUri,
        attachment,
        shouldSave
      );
    };
  },
  showGalleryView({ msgUri }) {
    return async (dispatch, getState) => {
      browser.tabs.create({
        url: "/gallery/index.html?uri=" + encodeURI(msgUri),
        windowId: getState().summary.windowId,
      });
    };
  },
};

// TODO: Once the WebExtension parts work themselves out a bit more,
// determine if this is worth sharing via a shared module with the background
// scripts, or if it doesn't need it.

async function setupConversationInTab(params, isInTab) {
  let isThreaded = params.get("isThreaded");
  isThreaded = !!parseInt(isThreaded);

  // If we start up Thunderbird with a saved conversation tab, then we
  // have no selected message. Fallback to the usual mode.
  if (!isThreaded && !topMail3Pane(window).gFolderDisplay.selectedMessage) {
    isThreaded = true;
  }

  if (window.frameElement) {
    window.frameElement.setAttribute("tooltip", "aHTMLTooltip");
  }
  const msgUrls = params.get("urls").split(",");
  const msgIds = [];
  for (const url of msgUrls) {
    const id = await browser.conversations.getMessageIdForUri(url);
    if (id) {
      msgIds.push(id);
    }
  }
  // It might happen that there are no messages left...
  if (!msgIds.length) {
    document.getElementById(
      "messageList"
    ).textContent = browser.i18n.getMessage(
      "message.movedOrDeletedConversation"
    );
  } else {
    window.Conversations = {
      currentConversation: null,
      counter: 0,
    };
    let freshConversation = new Conversation(
      window,
      // TODO: This should really become ids at some stage, but we need to
      // teach Conversation how to handle those.
      msgUrls,
      isThreaded,
      ++Conversations.counter,
      isInTab
    );
    let browserFrame = window.frameElement;
    // Because Thunderbird still hasn't fixed that...
    if (browserFrame) {
      browserFrame.setAttribute("context", "mailContext");
    }

    freshConversation.outputInto(window, async function (aConversation) {
      // This is a stripped-down version of what's in msgWindowApi.js,
      //  make sure the two are in sync!
      Conversations.currentConversation = aConversation;
      aConversation.completed = true;
      // TODO: Re-enable this.
      // registerQuickReply();
      // That's why we saved it before...
      // newComposeSessionByDraftIf();
      // TODO: expandQuickReply isn't defined anywhere. Should it be?
      // let willExpand = parseInt(params.get("willExpand"));
      // if (willExpand)
      //   expandQuickReply();
      // Create a new rule that will override the default rule, so that
      // the expanded quick reply is twice higher.
      document.body.classList.add("inTab");
      // Do this now so as to not defeat the whole expand/collapse
      // logic.
      if (
        await browser.conversations.getCorePref(
          "mailnews.mark_message_read.auto"
        )
      ) {
        const markAsReadAfterDelay = await browser.conversations.getCorePref(
          "mailnews.mark_message_read.delay"
        );
        let markAsReadDelay = 0;
        if (markAsReadAfterDelay) {
          markAsReadDelay = await browser.conversations.getCorePref(
            "mailnews.mark_message_read.delay.interval"
          );
        }
        setTimeout(function () {
          for (const id of msgIds) {
            browser.messages.update(id, { read: true }).catch(console.error);
          }
        }, markAsReadDelay * 1000);
      }
    });
  }
}

const messageActions = {
  waitForStartup() {
    return async (dispatch) => {
      const params = new URL(document.location).searchParams;

      const isInTab = params.has("urls");

      await dispatch({
        type: "SET_CONVERSATION_STATE",
        isInTab,
        windowId: BrowserSim.getWindowId(topMail3Pane(window)),
      });

      const platformInfo = await browser.runtime.getPlatformInfo();
      const defaultFontSize = await browser.conversations.getCorePref(
        "font.size.variable.x-western"
      );
      const browserForegroundColor = await browser.conversations.getCorePref(
        "browser.display.foreground_color"
      );
      const browserBackgroundColor = await browser.conversations.getCorePref(
        "browser.display.background_color"
      );
      await dispatch({
        type: "SET_SYSTEM_OPTIONS",
        browserForegroundColor,
        browserBackgroundColor,
        defaultFontSize,
        OS: platformInfo.os,
      });

      if (!isInTab) {
        return;
      }

      await new Promise((resolve, reject) => {
        let tries = 0;
        function checkStarted() {
          let mainWindow = topMail3Pane(window);
          if (
            mainWindow.Conversations &&
            mainWindow.Conversations.monkeyPatch &&
            mainWindow.Conversations.monkeyPatch.finishedStartup
          ) {
            resolve();
          } else {
            // Wait up to 10 seconds, if it is that slow we're in trouble.
            if (tries >= 100) {
              console.error("Failed waiting for monkeypatch to finish startup");
              reject();
              return;
            }
            tries++;
            setTimeout(checkStarted, 100);
          }
        }
        checkStarted();
      });
      await dispatch(
        messageActions.initializeMessageThread({ isInTab: true, params })
      );

      // We used to have a function for opening the window as a quick compose
      // in a tab. We'll need to figure out how to do this once we finish
      // rewriting - it may be better to have a completely seperate message
      // composition option.
      // } else if (params.get("quickCompose")) {
      //   masqueradeAsQuickCompose();
      // }
    };
  },

  getLateAttachments({ id }) {
    return async (dispatch) => {
      const attachments = await browser.conversations.getLateAttachments(id);
      const numAttachments = attachments.length;
      // This is bug 630011, remove when fixed
      const unknown = browser.i18n.getMessage("attachments.sizeUnknown");
      for (let i = 0; i < numAttachments; i++) {
        // -1 means size unknown
        let formattedSize = unknown;
        if (attachments[i].size != -1) {
          formattedSize = await browser.conversations.formatFileSize(
            attachments[i].size
          );
        }
        attachments[i].formattedSize = formattedSize;
      }

      await dispatch({
        type: "MSG_UPDATE_DATA_ID",
        msgData: {
          attachments,
          attachmentsPlural: await browser.conversations.makePlural(
            browser.i18n.getMessage("pluralForm"),
            browser.i18n.getMessage("attachments.numAttachments"),
            numAttachments
          ),
          id,
          needsLateAttachments: false,
        },
      });
    };
  },

  initializeMessageThread({ isInTab, params }) {
    return async (dispatch, getState) => {
      if (getState().summary.isInTab) {
        setupConversationInTab(params, isInTab).catch(console.error);
      }
    };
  },

  editDraft({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.editDraft(topMail3Pane(window), msgUri, shiftKey);
    };
  },

  editAsNew({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.editAsNew(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  reply({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.reply(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  replyAll({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.replyAll(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  replyList({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.replyList(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  forward({ msgUri, shiftKey }) {
    return async () => {
      MessageUtils.forward(topMail3Pane(window), msgUri, shiftKey);
    };
  },
  archive({ id }) {
    return async () => {
      browser.messages.archive([id]).catch(console.error);
    };
  },
  delete({ id }) {
    return async () => {
      browser.messages.delete([id]).catch(console.error);
    };
  },
  openClassic({ id }) {
    return async () => {
      browser.conversations.openInClassic(id).catch(console.error);
    };
  },
  openSource({ id }) {
    return async () => {
      browser.conversations.openInSourceView(id).catch(console.error);
    };
  },
  setTags({ id, tags }) {
    return async () => {
      browser.messages
        .update(id, {
          tags: tags.map((t) => t.id),
        })
        .catch(console.error);
    };
  },
  toggleTagByIndex({ id, index, tags }) {
    return async () => {
      browser.messages
        .listTags()
        .then((allTags) => {
          // browser.messages.update works via arrays of tag keys only,
          // so strip away all non-key information
          allTags = allTags.map((t) => t.key);
          tags = tags.map((t) => t.key);
          const toggledTag = allTags[index];

          // Toggling a tag that is out of range does nothing.
          if (!toggledTag) {
            return null;
          }
          if (tags.includes(toggledTag)) {
            tags = tags.filter((t) => t !== toggledTag);
          } else {
            tags.push(toggledTag);
          }

          return browser.messages.update(id, {
            tags,
          });
        })
        .catch(console.error);
    };
  },
  setStarred({ id, starred }) {
    return async () => {
      browser.messages
        .update(id, {
          flagged: starred,
        })
        .catch(console.error);
    };
  },
  markAsRead({ id }) {
    return async () => {
      browser.messages.update(id, { read: true }).catch(console.error);
    };
  },
  selected({ msgUri }) {
    return async () => {
      if (Conversations.currentConversation) {
        const msg = Conversations.currentConversation.getMessage(msgUri);
        if (msg) {
          msg.onSelected();
        }
      }
    };
  },
  toggleConversationRead({ read }) {
    return async (dispatch, getState) => {
      const state = getState().messages;
      for (let msg of state.msgData) {
        browser.messages.update(msg.id, { read }).catch(console.error);
      }
    };
  },
  archiveConversation() {
    return async (dispatch, getState) => {
      const state = getState();
      let msgs;
      if (state.summary.isInTab || Prefs.operate_on_conversations) {
        msgs = state.messages.msgData.map((msg) => msg.id);
      } else {
        msgs = await browser.convMsgWindow.selectedMessages(
          state.summary.windowId
        );
        msgs = msgs.map((m) => m.id);
      }
      browser.messages.archive(msgs).catch(console.error);
    };
  },
  deleteConversation() {
    return async (dispatch, getState) => {
      const state = getState();
      let msgs;
      if (state.summary.isInTab || Prefs.operate_on_conversations) {
        msgs = state.messages.msgData.map((msg) => msg.id);
      } else {
        msgs = await browser.convMsgWindow.selectedMessages(
          state.summary.windowId
        );
        msgs = msgs.map((m) => m.id);
      }
      browser.messages.delete(msgs).catch(console.error);
      if (state.summary.isInTab) {
        // The additional nulls appear to be necessary due to our browser proxying.
        let currentTab = await browser.tabs.query({
          active: true,
          currentWindow: null,
          lastFocusedWindow: null,
          title: null,
          windowId: state.summary.windowId,
          windowType: null,
        });
        await browser.tabs.remove(currentTab[0].id);
      }
    };
  },
  clickIframe({ event }) {
    return () => {
      // Hand this off to Thunderbird's content clicking algorithm as that's simplest.
      if (!topMail3Pane(window).contentAreaClick(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
  },
  showRemoteContent({ msgUri }) {
    return async () => {
      Conversations.currentConversation.showRemoteContent(msgUri);
    };
  },
  alwaysShowRemoteContent({ msgUri, realFrom }) {
    return async () => {
      Conversations.currentConversation.alwaysShowRemoteContent(
        realFrom,
        msgUri
      );
    };
  },
  detachTab() {
    return async (dispatch, getState) => {
      const state = getState();
      // TODO: Fix re-enabling composition when expanded into new tab.
      // let willExpand = element.hasClass("expand") && startedEditing();
      // First, save the draft, and once it's saved, then move on to opening the
      // conversation in a new tab...
      // onSave(() => {
      const urls = state.messages.msgData.map((x) => x.msgUri);
      BrowserSim.callBackgroundFunc("_window", "openConversation", [
        state.summary.windowId,
        urls,
        // "&willExpand=" + Number(willExpand);
      ]);
    };
  },
  notificationClick({ msgUri, notificationType, extraData }) {
    return async () => {
      const msg = Conversations.currentConversation.getMessage(msgUri);
      msg.msgPluginNotification(
        topMail3Pane(window),
        notificationType,
        extraData
      );
    };
  },
  tagClick({ msgUri, event, details }) {
    return async () => {
      const msg = Conversations.currentConversation.getMessage(msgUri);
      msg.msgPluginTagClick(topMail3Pane(window), event, details);
    };
  },
  switchToFolderAndMsg({ id }) {
    return async () => {
      browser.conversations.switchToFolderAndMsg(id).catch(console.error);
    };
  },
  sendUnsent() {
    return async () => {
      browser.conversations.sendUnsent().catch(console.error);
    };
  },
};

function messages(state = initialMessages, action) {
  switch (action.type) {
    case "REPLACE_CONVERSATION_DETAILS": {
      return {
        ...state,
        ...action.messages,
      };
    }
    case "MSG_EXPAND": {
      return modifyOnlyMsg(state, action.msgUri, (msg) => {
        const newMsg = { ...msg };
        newMsg.expanded = action.expand;
        return newMsg;
      });
    }
    case "TOGGLE_CONVERSATION_EXPANDED": {
      const newState = { ...state };
      const newMsgData = [];
      for (let msg of newState.msgData) {
        const newMsg = { ...msg, expanded: action.expand };
        newMsgData.push(newMsg);
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "MSG_UPDATE_DATA": {
      return modifyOnlyMsg(state, action.msgData.msgUri, (msg) => {
        return { ...msg, ...action.msgData };
      });
    }
    case "MSG_UPDATE_DATA_ID": {
      return modifyOnlyMsgId(state, action.msgData.id, (msg) => {
        return { ...msg, ...action.msgData };
      });
    }
    case "MSG_ADD_SPECIAL_TAG": {
      return modifyOnlyMsg(state, action.uri, (msg) => {
        let newSpecialTags;
        if (!("specialTags" in msg)) {
          newSpecialTags = [action.tagDetails];
        } else {
          newSpecialTags = [...msg.specialTags, action.tagDetails];
        }
        return { ...msg, specialTags: newSpecialTags };
      });
    }
    case "MSG_REMOVE_SPECIAL_TAG": {
      return modifyOnlyMsg(state, action.uri, (msg) => {
        const newSpecialTags = [...msg.specialTags];
        return {
          ...msg,
          specialTags: newSpecialTags.filter(
            (t) => t.name != action.tagDetails.name
          ),
        };
      });
    }
    case "MARK_AS_JUNK": {
      // This action should only be activated when the conversation is not a
      //  conversation in a tab AND there's only one message in the conversation,
      //  i.e. the currently selected message
      browser.conversations
        .markSelectedAsJunk(action.isJunk)
        .catch(console.error);
      if (!action.isJunk) {
        // TODO: We should possibly wait until we get the notification before
        // clearing the state here.
        return modifyOnlyMsgId(state, action.id, (msg) => {
          const newMsg = { ...msg };
          newMsg.isJunk = action.isJunk;
          return newMsg;
        });
      }
      return state;
    }
    case "MSG_IGNORE_PHISHING": {
      MessageUtils.ignorePhishing(action.msgUri);
      return modifyOnlyMsg(state, action.msgUri, (msg) => {
        const newMsg = { ...msg };
        newMsg.isPhishing = false;
        return newMsg;
      });
    }
    case "MSG_SHOW_DETAILS": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri == action.msgUri) {
          newMsgData.push({ ...state.msgData[i], detailsShowing: action.show });
          if (!newMsgData.hdrDetails) {
            // Let this exit before we start the function.
            setTimeout(() => {
              MessageUtils.getMsgHdrDetails(window, action.msgUri);
            }, 0);
          }
        } else {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "MSG_HDR_DETAILS": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri == action.msgUri) {
          newMsgData.push({
            ...state.msgData[i],
            extraLines: action.extraLines,
          });
        } else {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "REMOVE_MESSAGE_FROM_CONVERSATION": {
      const newState = { ...state };
      const newMsgData = [];
      for (let i = 0; i < state.msgData.length; i++) {
        if (state.msgData[i].msgUri != action.msgUri) {
          newMsgData.push(state.msgData[i]);
        }
      }
      newState.msgData = newMsgData;
      return newState;
    }
    case "APPEND_MESSAGES": {
      const newState = { ...state };
      newState.msgData = newState.msgData.concat(action.msgData);
      return newState;
    }
    case "MSG_SHOW_NOTIFICATION": {
      return modifyOnlyMsg(state, action.msgData.msgUri, (msg) => {
        const newMsg = { ...msg };
        if ("extraNotifications" in msg) {
          let i = msg.extraNotifications.findIndex(
            (n) => n.type == action.msgData.notification.type
          );
          if (i != -1) {
            newMsg.extraNotifications = [...msg.extraNotifications];
            newMsg.extraNotifications[i] = action.msgData.notification;
          } else {
            newMsg.extraNotifications = [
              ...msg.extraNotifications,
              action.msgData.notification,
            ];
          }
        } else {
          newMsg.extraNotifications = [action.msgData.notification];
        }
        return newMsg;
      });
    }
    default: {
      return state;
    }
  }
}

const summaryActions = {
  showMessagesInvolving({ name, email }) {
    return async (dispatch, getState) => {
      await browser.convContacts
        .showMessagesInvolving({
          email,
          title: browser.i18n.getMessage("involvingTabTitle", [name]),
          windowId: getState().summary.windowId,
        })
        .catch(console.error);
    };
  },
  sendEmail({ name, email }) {
    return async () => {
      const dest = await browser.convContacts.makeMimeAddress({ name, email });
      await browser.convContacts.composeNew({ to: dest }).catch(console.error);
    };
  },
};

function summary(state = initialSummary, action) {
  switch (action.type) {
    case "SET_CONVERSATION_STATE": {
      return {
        ...state,
        isInTab: action.isInTab,
        windowId: action.windowId,
      };
    }
    case "SET_SYSTEM_OPTIONS": {
      let tenPxFactor = 0.625;
      if (action.OS == "mac") {
        tenPxFactor = 0.666;
      } else if (action.OS == "win") {
        tenPxFactor = 0.7;
      }

      return {
        ...state,
        browserForegroundColor: action.browserForegroundColor,
        browserBackgroundColor: action.browserBackgroundColor,
        defaultFontSize: action.defaultFontSize,
        OS: action.OS,
        tenPxFactor,
      };
    }
    case "REPLACE_CONVERSATION_DETAILS": {
      if (!("summary" in action)) {
        return state;
      }
      return {
        ...state,
        ...action.summary,
      };
    }
    case "ADD_CONTACT": {
      browser.convContacts.beginNew({
        email: action.email,
        displayName: action.name,
      });
      // TODO: In theory we should be updating the store so that the button can
      // then be updated to indicate this is now in the address book. However,
      // until we start getting the full conversation messages hooked up, this
      // won't be easy. As this is only a small bit of hidden UI, we can punt on
      // this for now.
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
    case "EDIT_CONTACT": {
      browser.convContacts.beginEdit({
        email: action.email,
      });
      return state;
    }
    case "FORWARD_CONVERSATION": {
      Conversations.currentConversation.forward().catch(console.error);
      return state;
    }
    case "OPEN_LINK": {
      getMail3Pane().messenger.launchExternalURL(action.url);
      return state;
    }
    case "PRINT_CONVERSATION": {
      // TODO: Fix printing
      printConversation();
      return state;
    }
    case "MSG_STREAM_MSG": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading++;
      }
      state.conversation
        .getMessage(action.msgUri)
        .streamMessage(topMail3Pane(window).msgWindow, action.docshell);
      return newState;
    }
    case "MSG_STREAM_LOAD_FINISHED": {
      let newState = { ...state };
      if (!action.dueToExpansion) {
        newState.iframesLoading--;
        if (newState.iframesLoading < 0) {
          newState.iframesLoading = 0;
        }
      }
      // It might be that we're trying to send a message on unmount, but the
      // conversation/message has gone away. If that's the case, we just skip
      // and move on.
      if (state.conversation && state.conversation.getMessage) {
        const msg = state.conversation.getMessage(action.msgUri);
        if (msg) {
          msg.postStreamMessage(topMail3Pane(window).msgWindow, action.iframe);
        }
      }
      return newState;
    }
    default: {
      return state;
    }
  }
}

const conversationApp = Redux.combineReducers({
  messages,
  summary,
});
