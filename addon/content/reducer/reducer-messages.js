/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global BrowserSim, topMail3Pane */

import * as RTK from "@reduxjs/toolkit";
import { browser as _browser } from "../es-modules/thunderbird-compat.js";

// Prefer the global browser object to the imported one.
window.browser = window.browser || _browser;

export const initialMessages = {
  msgData: [],
};

function modifyOnlyMsg(state, id, modifier) {
  return {
    ...state,
    msgData: state.msgData.map((msg) => (msg.id == id ? modifier(msg) : msg)),
  };
}

export const messageActions = {
  getLateAttachments({ id }) {
    return async (dispatch, getState) => {
      const attachments = await browser.conversations.getLateAttachments(
        id,
        getState().summary.prefs.extraAttachments
      );
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
        messagesSlice.actions.updateAttachmentData({
          id,
          attachments,
          attachmentsPlural: await browser.conversations.makePlural(
            browser.i18n.getMessage("pluralForm"),
            browser.i18n.getMessage("attachments.numAttachments"),
            numAttachments
          ),
          needsLateAttachments: false,
        })
      );
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
  selected({ id }) {
    return async () => {
      if (window.Conversations?.currentConversation) {
        const msg =
          window.Conversations.currentConversation.getMessageByApiId(id);
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
      if (state.summary.isInTab || state.summary.prefs.operateOnConversations) {
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
      if (state.summary.isInTab || state.summary.prefs.operateOnConversations) {
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
      await dispatch(
        messagesSlice.actions.setHasRemoteContent({
          id,
          hasRemoteContent: false,
        })
      );
    };
  },
  alwaysShowRemoteContent({ id, realFrom }) {
    return async (dispatch) => {
      await browser.conversations.alwaysShowRemoteContent(realFrom);
      await dispatch(
        messagesSlice.actions.setHasRemoteContent({
          id,
          hasRemoteContent: false,
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
      let urls = [];
      for (let m of state.messages.msgData) {
        urls.push(await browser.conversations.getMessageUriForId(m.id));
      }
      BrowserSim.callBackgroundFunc("_window", "openConversation", [
        state.summary.windowId,
        urls,
        // "&willExpand=" + Number(willExpand);
      ]);
    };
  },
  notificationClick({ id, notificationType, extraData }) {
    return async (dispatch, getState) => {
      const msg =
        window.Conversations.currentConversation.getMessageByApiId(id);

      if (notificationType == "calendar") {
        await browser.convCalendar.onMessageNotification(
          getState().summary.tabId,
          extraData.execute
        );
        return;
      }
      msg.msgPluginNotification(
        topMail3Pane(window),
        notificationType,
        extraData
      );
    };
  },
  tagClick({ id, event, details }) {
    return async () => {
      const msg =
        window.Conversations.currentConversation.getMessageByApiId(id);
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
        messagesSlice.actions.setPhishing({
          id,
          isPhishing: false,
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
     * @param {object} state
     * @param {object} payload
     * @param {object} payload.payload
     * @param {object} payload.payload.messages
     *   The messages to insert or append.
     * @param {string} payload.payload.mode
     *   Can be "append", "replaceAll" or "replaceMsg". replaceMsg will replace
     *   only a single message.
     */
    updateConversation(state, { payload: { messages, mode } }) {
      if (mode == "append") {
        return { ...state, msgData: state.msgData.concat(messages.msgData) };
      }
      if (mode == "replaceMsg") {
        return modifyOnlyMsg(state, messages.msgData[0].id, (msg) => ({
          ...msg,
          ...messages.msgData[0],
        }));
      }
      return { ...state, ...messages };
    },
    msgExpand(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
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
    setHasRemoteContent(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        hasRemoteContent: payload.hasRemoteContent,
      }));
    },
    setPhishing(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        isPhishing: payload.isPhishing,
      }));
    },
    setSmimeReload(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        smimeReload: payload.smimeReload,
      }));
    },
    updateAttachmentData(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        attachments: payload.attachments,
        attachmentsPlural: payload.attachmentsPlural,
        needsLateAttachments: payload.needsLateAttachments,
      }));
    },
    msgAddSpecialTag(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        specialTags: (msg.specialTags || []).concat(payload.tagDetails),
      }));
    },
    msgRemoveSpecialTag(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => {
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
        : modifyOnlyMsg(state, payload.id, (msg) => ({
            ...msg,
            isJunk: false,
          }));
    },
    msgHdrDetails(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => {
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
        msgData: state.msgData.filter((m) => m.id !== payload.id),
      };
    },
    clearScrollto(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => {
        return { ...msg, scrollTo: false };
      });
    },
    msgShowNotification(state, { payload }) {
      return modifyOnlyMsg(state, payload.msgData.id, (msg) => {
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
