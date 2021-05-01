/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Conversation, BrowserSim, topMail3Pane */

import { summaryActions } from "./reducer-summary.js";
import * as RTK from "@reduxjs/toolkit";
import { browser as _browser } from "../es-modules/thunderbird-compat.js";

// Prefer the global browser object to the imported one.
window.browser = window.browser || _browser;

export const initialMessages = {
  msgData: [],
};

function modifyOnlyMsg(state, msgUri, modifier) {
  return {
    ...state,
    msgData: state.msgData.map((msg) =>
      msg.msgUri == msgUri ? modifier(msg) : msg
    ),
  };
}

function modifyOnlyMsgId(state, id, modifier) {
  return {
    ...state,
    msgData: state.msgData.map((msg) => (msg.id == id ? modifier(msg) : msg)),
  };
}

async function getPreference(name, defaultValue) {
  const prefs = await browser.storage.local.get("preferences");
  return prefs?.preferences?.[name] ?? defaultValue;
}

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
      ++window.Conversations.counter,
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
      window.Conversations.currentConversation = aConversation;
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

export const messageActions = {
  waitForStartup() {
    return async (dispatch) => {
      const params = new URL(document.location).searchParams;

      const isInTab = params.has("urls");
      const topWin = topMail3Pane(window);
      await dispatch(
        summaryActions.setConversationState({
          isInTab,
          tabId: BrowserSim.getTabId(topWin, window),
          windowId: BrowserSim.getWindowId(topWin),
        })
      );

      const platformInfo = await browser.runtime.getPlatformInfo();
      const browserInfo = await browser.runtime.getBrowserInfo();
      const defaultFontSize = await browser.conversations.getCorePref(
        "font.size.variable.x-western"
      );
      const browserForegroundColor = await browser.conversations.getCorePref(
        "browser.display.foreground_color"
      );
      const browserBackgroundColor = await browser.conversations.getCorePref(
        "browser.display.background_color"
      );
      const defaultDetailsShowing =
        (await browser.conversations.getCorePref("mail.show_headers")) == 2;

      await dispatch(
        summaryActions.setSystemOptions({
          browserForegroundColor,
          browserBackgroundColor,
          defaultDetailsShowing,
          defaultFontSize,
          hideQuickReply: await getPreference("hide_quick_reply", false),
          OS: platformInfo.os,
          browserVersion: browserInfo.version,
        })
      );

      if (!isInTab) {
        return;
      }

      await new Promise((resolve, reject) => {
        let tries = 0;
        function checkStarted() {
          let mainWindow = topMail3Pane(window);
          if (
            mainWindow.Conversations &&
            mainWindow.Conversations.finishedStartup
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
      // rewriting - it may be better to have a completely separate message
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

      await dispatch(
        messagesSlice.actions.msgUpdateDataId({
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
        })
      );
    };
  },

  initializeMessageThread({ isInTab, params }) {
    return async (dispatch, getState) => {
      if (getState().summary.isInTab) {
        setupConversationInTab(params, isInTab).catch(console.error);
      }
    };
  },

  editDraft({ id, shiftKey }) {
    return async () => {
      browser.conversations.beginEdit(id, "editDraft").catch(console.error);
    };
  },

  editAsNew({ id, shiftKey }) {
    return async () => {
      browser.conversations.beginEdit(id, "editAsNew").catch(console.error);
    };
  },
  reply({ id, shiftKey }) {
    return async () => {
      browser.conversations
        .beginReply(id, "replyToSender")
        .catch(console.error);
    };
  },
  replyAll({ id, shiftKey }) {
    return async () => {
      browser.conversations.beginReply(id, "replyToAll").catch(console.error);
    };
  },
  replyList({ id, shiftKey }) {
    return async () => {
      browser.conversations.beginReply(id, "replyToList").catch(console.error);
    };
  },
  forward({ id, shiftKey }) {
    return async () => {
      let forwardMode =
        (await browser.conversations.getCorePref(
          "mail.forward_message_mode"
        )) ?? 0;
      browser.conversations
        .beginForward(
          id,
          forwardMode == 0 ? "forwardAsAttachment" : "forwardInline"
        )
        .catch(console.error);
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
          tags: tags.map((t) => t.key),
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
      if (window.Conversations?.currentConversation) {
        const msg = window.Conversations.currentConversation.getMessage(msgUri);
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
      if (
        state.summary.isInTab ||
        (await getPreference("operate_on_conversations", false))
      ) {
        msgs = state.messages.msgData.map((msg) => msg.id);
      } else {
        if ("getDisplayedMessages" in browser.messageDisplay) {
          msgs = await browser.messageDisplay.getDisplayedMessages(
            state.summary.tabId
          );
        } else {
          msgs = await browser.convMsgWindow.getDisplayedMessages(
            state.summary.tabId
          );
        }
        msgs = msgs.map((m) => m.id);
      }
      browser.messages.archive(msgs).catch(console.error);
    };
  },
  deleteConversation() {
    return async (dispatch, getState) => {
      const state = getState();
      let msgs;
      if (
        state.summary.isInTab ||
        (await getPreference("operate_on_conversations", false))
      ) {
        msgs = state.messages.msgData.map((msg) => msg.id);
      } else {
        if ("getDisplayedMessages" in browser.messageDisplay) {
          msgs = await browser.messageDisplay.getDisplayedMessages(
            state.summary.tabId
          );
        } else {
          msgs = await browser.convMsgWindow.getDisplayedMessages(
            state.summary.tabId
          );
        }
        msgs = msgs.map((m) => m.id);
      }
      try {
        await browser.messages.delete(msgs);
      } catch (ex) {
        console.error(ex);
      }
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
  showRemoteContent({ id }) {
    return async (dispatch) => {
      await browser.conversations.showRemoteContent(id);

      const msg = window.Conversations.currentConversation.getMessageByApiId(
        id
      );
      // Turn remote content message "off", as although it has it, it can be loaded.
      msg.hasRemoteContent = false;
      const msgData = await msg.toReactData();
      dispatch(
        messagesSlice.actions.msgUpdateData({
          msgData,
        })
      );
    };
  },
  alwaysShowRemoteContent({ id, realFrom }) {
    return async (dispatch) => {
      await browser.conversations.alwaysShowRemoteContent(realFrom);

      const msg = window.Conversations.currentConversation.getMessageByApiId(
        id
      );
      // Turn remote content message "off", as although it has it, it can be loaded.
      msg.hasRemoteContent = false;

      const msgData = await msg.toReactData();
      dispatch(
        messagesSlice.actions.msgUpdateData({
          msgData,
        })
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
      const msg = window.Conversations.currentConversation.getMessage(msgUri);
      msg.msgPluginNotification(
        topMail3Pane(window),
        notificationType,
        extraData
      );
    };
  },
  tagClick({ msgUri, event, details }) {
    return async () => {
      const msg = window.Conversations.currentConversation.getMessage(msgUri);
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
  ignorePhishing({ id }) {
    return async (dispatch) => {
      await browser.conversations.ignorePhishing(id);
      await dispatch(
        messagesSlice.actions.msgUpdateDataId({
          msgData: {
            isPhishing: false,
          },
        })
      );
    };
  },
  showMsgDetails({ id, detailsShowing }) {
    return async (dispatch, getState) => {
      if (!detailsShowing) {
        await dispatch(
          messagesSlice.actions.msgHdrDetails({
            detailsShowing: false,
            id,
          })
        );
        return;
      }
      let currentMsg = getState().messages.msgData.find((msg) => msg.id == id);
      // If we already have header information, don't get it again.
      if (currentMsg?.extraLines?.length) {
        await dispatch(
          messagesSlice.actions.msgHdrDetails({
            detailsShowing: true,
            id,
          })
        );
        return;
      }
      let msg = await browser.messages.getFull(id);
      try {
        let extraLines = [
          {
            key: browser.i18n.getMessage("message.headerFolder"),
            value: currentMsg.folderName,
          },
        ];
        const interestingHeaders = [
          "mailed-by",
          "x-mailer",
          "mailer",
          "date",
          "user-agent",
          "reply-to",
        ];
        for (const h of interestingHeaders) {
          if (h in msg.headers) {
            let key = h;
            // Not all the header names are translated.
            if (h == "date") {
              key = browser.i18n.getMessage("message.headerDate");
            }
            extraLines.push({
              key,
              value: msg.headers[h],
            });
          }
        }
        extraLines.push({
          key: browser.i18n.getMessage("message.headerSubject"),
          value: currentMsg?.subject,
        });

        dispatch(
          messagesSlice.actions.msgHdrDetails({
            extraLines,
            detailsShowing: true,
            id,
          })
        );
      } catch (ex) {
        console.error(ex);
      }
    };
  },
  markAsJunk(action) {
    return async (dispatch) => {
      // This action should only be activated when the conversation is not a
      //  conversation in a tab AND there's only one message in the conversation,
      //  i.e. the currently selected message
      await browser.conversations
        .markSelectedAsJunk(action.isJunk)
        .catch(console.error);
      dispatch(messagesSlice.actions.msgSetIsJunk(action));
    };
  },
};

export const messagesSlice = RTK.createSlice({
  name: "messages",
  initialState: initialMessages,
  reducers: {
    /**
     * Update the message list either replacing or appending the messages.
     *
     * @param {object} messages
     *   The messages to insert or append.
     * @param {boolean} append
     *   Set to true to append messages, false to replace the current conversation.
     */
    updateConversation(state, { payload }) {
      const { messages, append } = payload;
      if (append) {
        return { ...state, msgData: state.msgData.concat(messages.msgData) };
      }
      return { ...state, ...messages };
    },
    msgExpand(state, { payload }) {
      return modifyOnlyMsg(state, payload.msgUri, (msg) => ({
        ...msg,
        expanded: payload.expand,
      }));
    },
    toggleConversationExpanded(state, { payload }) {
      return {
        ...state,
        msgData: state.msgData.map((m) => ({ ...m, expanded: payload.expand })),
      };
    },
    msgUpdateData(state, { payload }) {
      return modifyOnlyMsg(state, payload.msgData.msgUri, (msg) => ({
        ...msg,
        ...payload.msgData,
      }));
    },
    msgUpdateDataId(state, { payload }) {
      return modifyOnlyMsgId(state, payload.msgData.id, (msg) => ({
        ...msg,
        ...payload.msgData,
      }));
    },
    msgAddSpecialTag(state, { payload }) {
      return modifyOnlyMsg(state, payload.uri, (msg) => ({
        ...msg,
        specialTags: (msg.specialTags || []).concat(payload.tagDetails),
      }));
    },
    msgRemoveSpecialTag(state, { payload }) {
      return modifyOnlyMsg(state, payload.uri, (msg) => {
        if (msg.specialTags == null) {
          return msg;
        }
        return {
          ...msg,
          specialTags: msg.specialTags.filter(
            (t) => t.name != payload.tagDetails.name
          ),
        };
      });
    },
    msgSetIsJunk(state, { payload }) {
      return payload.isJunk
        ? state
        : modifyOnlyMsgId(state, payload.id, (msg) => ({
            ...msg,
            isJunk: false,
          }));
    },
    msgHdrDetails(state, { payload }) {
      return modifyOnlyMsgId(state, payload.id, (msg) => {
        if (payload.extraLines != null) {
          return { ...msg, detailsShowing: payload.detailsShowing };
        }
        return {
          ...msg,
          detailsShowing: payload.detailsShowing,
          extraLines: payload.extraLines,
        };
      });
    },
    removeMessageFromConversation(state, { payload }) {
      return {
        ...state,
        msgData: state.msgData.filter((m) => m.msgUri !== payload.msgUri),
      };
    },
    clearScrollto(state, { payload }) {
      return modifyOnlyMsgId(state, payload.id, (msg) => {
        return { ...msg, scrollTo: false };
      });
    },
    msgShowNotification(state, { payload }) {
      return modifyOnlyMsg(state, payload.msgData.msgUri, (msg) => {
        // We put the notification on the end of the `extraNotifications` list
        // unless there is a notification with a matching type, in which case
        // we update it in place.
        let modifiedInPlace = false;
        let extraNotifications = (msg.extraNotifications || []).map((n) => {
          if (n.type === payload.msgData.notification.type) {
            modifiedInPlace = true;
            return payload.msgData.notification;
          }
          return n;
        });
        if (!modifiedInPlace) {
          extraNotifications.push(payload.msgData.notification);
        }
        return { ...msg, extraNotifications };
      });
    },
  },
});

Object.assign(messageActions, messagesSlice.actions);
