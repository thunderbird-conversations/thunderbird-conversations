/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global BrowserSim */

import * as RTK from "@reduxjs/toolkit";
import { messageUtils } from "./messageUtils.mjs";

export const initialMessages = {
  msgData: [],
};

function modifyOnlyMsg(state, id, modifier) {
  return {
    ...state,
    msgData: state.msgData.map((msg) => (msg.id == id ? modifier(msg) : msg)),
  };
}

async function getParamsForCompose(msg, shiftKey) {
  let identityId = await messageUtils.getBestIdentityForReply(msg);
  let params = {
    identityId,
  };
  if (shiftKey) {
    let identity = await browser.identities.get(identityId);
    params.isPlainText = identity.composeHtml;
  }
  return params;
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
          formattedSize = await browser.messengerUtilities.formatFileSize(
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
    return async (dispatch, getState) => {
      browser.conversations.beginEdit(id, "editDraft").catch(console.error);
    };
  },
  editAsNew({ id, shiftKey }) {
    return async (dispatch, getState) => {
      let msg = getState().messages.msgData.find((m) => m.id == id);
      let params = await getParamsForCompose(msg, shiftKey);
      browser.compose.beginNew(id, params);
    };
  },
  reply({ id, type, shiftKey }) {
    return async (dispatch, getState) => {
      const mode = {
        reply: "replyToSender",
        replyAll: "replyToAll",
        replyList: "replyToList",
      };
      let msg = getState().messages.msgData.find((m) => m.id == id);
      let params = await getParamsForCompose(msg, shiftKey);
      browser.compose.beginReply(id, mode[type], params).catch(console.error);
    };
  },
  forward({ id, shiftKey }) {
    return async (dispatch, getState) => {
      let forwardMode =
        (await browser.conversations.getCorePref(
          "mail.forward_message_mode"
        )) ?? 0;
      let msg = getState().messages.msgData.find((m) => m.id == id);
      let params = await getParamsForCompose(msg, shiftKey);
      browser.compose
        .beginForward(
          id,
          forwardMode == 0 ? "forwardAsAttachment" : "forwardInline",
          params
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
          tags = tags.map((t) => t.key);
          const toggledTag = allTags[index].key;

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
  expandMsg({ id, expand }) {
    return async (dispatch, getState) => {
      await dispatch(
        messageActions.msgExpand({
          expand,
          id,
        })
      );
      if (expand && getState().summary.autoMarkAsRead) {
        await dispatch(
          messageActions.markAsRead({
            id,
          })
        );
      }
    };
  },
  markAsRead({ id }) {
    return async () => {
      browser.messages.update(id, { read: true }).catch(console.error);
    };
  },
  selected({ id }) {
    // TODO: Do we still need this.
    return async () => {};
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
        msgs = await browser.messageDisplay.getDisplayedMessages(
          state.summary.tabId
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
      if (state.summary.isInTab || state.summary.prefs.operateOnConversations) {
        msgs = state.messages.msgData.map((msg) => msg.id);
      } else {
        msgs = await browser.messageDisplay.getDisplayedMessages(
          state.summary.tabId
        );
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
          cookieStoreId: null,
          currentWindow: null,
          lastFocusedWindow: null,
          title: null,
          windowId: state.summary.windowId,
          windowType: null,
          url: null,
        });
        await browser.tabs.remove(currentTab[0].id);
      }
    };
  },
  clickIframe({ event }) {
    return () => {
      // Hand this off to Thunderbird's content clicking algorithm as that's simplest.
      // @ts-expect-error
      if (!window.browsingContext.topChromeWindow.contentAreaClick(event)) {
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
      // @ts-expect-error
      BrowserSim.callBackgroundFunc("_window", "openConversation", [
        state.summary.windowId,
        urls,
        // "&willExpand=" + Number(willExpand);
      ]);
    };
  },
  notificationClick({ id, notificationType, extraData }) {
    return async (dispatch, getState) => {
      if (notificationType == "calendar") {
        let state = getState();
        await browser.convCalendar.onMessageNotification(
          state.summary.windowId,
          state.summary.tabId,
          id,
          extraData.execute
        );
        return;
      }
      console.error(
        "Received notificationClick for unknown type",
        notificationType
      );
    };
  },
  tagClick({ id, event, details }) {
    return async (dispatch, getState) => {
      if (details.type == "enigmail") {
        await browser.convOpenPgp.handleTagClick(getState().summary.tabId, id);
        return;
      }
      console.error("Unsupported click type", details.type);
    };
  },
  switchToFolderAndMsg({ id }) {
    return async (dispatch, getState) => {
      browser.mailTabs.setSelectedMessages(getState().summary.tabId, [id]);
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
    return async (dispatch, getState) => {
      // This action should only be activated when the conversation is not a
      //  conversation in a tab AND there's only one message in the conversation,
      //  i.e. the currently selected message
      await browser.conversations
        .markSelectedAsJunk(getState().summary.tabId, action.isJunk)
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
     */
    replaceConversation(state, { payload: { messages } }) {
      return { ...state, msgData: messages };
    },
    addMessages(state, { payload }) {
      return {
        ...state,
        msgData: [...state.msgData, ...payload.msgs],
      };
    },
    updateMessages(state, { payload }) {
      let msgData = state.msgData.map((msg) => {
        let updateMsg = payload.msgs.find((m) => m.id == msg.id);
        if (!updateMsg) {
          return msg;
        }

        // When modifying messages, we don't want to override various fields
        // about the message display state.
        delete updateMsg.hasRemoteContent;
        delete updateMsg.expanded;
        delete updateMsg.isPhishing;
        delete updateMsg.detailsShowing;
        delete updateMsg.initialPosition;

        return {
          ...msg,
          ...updateMsg,
        };
      });

      return {
        ...state,
        msgData,
      };
    },
    removeMessages(state, { payload }) {
      return {
        ...state,
        msgData: state.msgData.filter((msg) => !payload.msgs.includes(msg.id)),
      };
    },
    addContactPhoto(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => {
        let newMsg = { ...msg };

        if (newMsg.from.contactId == payload.contactId) {
          newMsg.from = { ...msg.from, avatar: payload.url };
        }
        return newMsg;
      });
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
    setPrintBody(state, { payload }) {
      return modifyOnlyMsg(state, payload.id, (msg) => ({
        ...msg,
        printBody: payload.printBody,
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
      return modifyOnlyMsg(state, payload.id, (msg) => {
        if (msg.specialTags?.find((t) => t.type == payload.tagDetails.type)) {
          return {
            ...msg,
            specialTags: [...msg.specialTags].map((t) => {
              if (t.type == payload.tagDetails.type) {
                return payload.tagDetails;
              }
              return t;
            }),
          };
        }
        return {
          ...msg,
          specialTags: (msg.specialTags || []).concat(payload.tagDetails),
        };
      });
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
        if (!payload.extraLines) {
          return { ...msg, detailsShowing: payload.detailsShowing };
        }
        return {
          ...msg,
          detailsShowing: payload.detailsShowing,
          extraLines: payload.extraLines,
        };
      });
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
