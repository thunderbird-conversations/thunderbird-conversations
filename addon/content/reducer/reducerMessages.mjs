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

/**
 * Gather all descendent text under given node.
 *
 * @param {Node} root - The root node to gather text from.
 * @returns {string} The text data under the node.
 */
function gatherTextUnder(root) {
  var text = "";
  var node = root.firstChild;
  var depth = 1;
  while (node && depth > 0) {
    // See if this node is text.
    if (node.nodeType == Node.TEXT_NODE) {
      // Add this text to our collection.
      // @ts-ignore
      text += " " + node.data;
    } else if (HTMLImageElement.isInstance(node)) {
      // If it has an alt= attribute, add that.
      // @ts-ignore
      var altText = node.getAttribute("alt");
      if (altText && altText != "") {
        text += " " + altText;
      }
    }
    // Find next node to test.
    if (node.firstChild) {
      // If it has children, go to first child.
      node = node.firstChild;
      depth++;
    } else if (node.nextSibling) {
      // No children, try next sibling.
      node = node.nextSibling;
    } else {
      // Last resort is a sibling of an ancestor.
      while (node && depth > 0) {
        // @ts-ignore
        node = node.parentNode;
        depth--;
        if (node.nextSibling) {
          node = node.nextSibling;
          break;
        }
      }
    }
  }
  // Strip leading and trailing whitespace.
  text = text.trim();
  // Compress remaining whitespace.
  text = text.replace(/\s+/g, " ");
  return text;
}

/**
 * Extracts linkNode and href for a click event.
 *
 * @param {UIEvent} event
 *        The click event.
 * @returns {Array<any>} [href, linkNode, linkPrincipal].
 *
 * Note that linkNode will be null if the click wasn't on an anchor
 *       element. This includes SVG links, because callers expect |node|
 *       to behave like an <a> element, which SVG links (XLink) don't.
 */
function hrefAndLinkNodeForClickEvent(event) {
  // We should get a window; off the event, and bail if not:
  // let content = event.view; //|| event.composedTarget?.documentGlobal;
  // if (!content?.HTMLAnchorElement) {
  //   return null;
  // }
  // Be consistent with what ContextMenuChild.sys.mjs does.
  function hrefAndLinkNodeForHTMLLink(aElement) {
    if (
      (HTMLAnchorElement.isInstance(aElement) && aElement.href) ||
      (HTMLAreaElement.isInstance(aElement) && aElement.href) ||
      HTMLLinkElement.isInstance(aElement)
    ) {
      let href = URL.parse(aElement.href)?.href ?? null;
      if (href) {
        // TODO: Figure out the HTML version of this.
        // @ts-ignore
        return [href, aElement, aElement.ownerDocument.nodePrincipal];
      }
    }
    return null;
  }
  // function hrefAndLinkNodeForNonHTMLink(aElement) {
  //   if (
  //     aElement.localName == "a" ||
  //     (content.MathMLElement.isInstance(aElement) &&
  //       !lazy.mathMLNonAnchorLinksDisabled)
  //   ) {
  //     let href =
  //       aElement.getAttribute("href") ??
  //       aElement.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  //     // Note that empty string hrefs are valid, and distinct from missing
  //     // attributes (null). Passing null to `URL.parse` will be stringified
  //     // to "null" and when a base URI is present this may form a valid yet
  //     // unintentional URL. So we explicitly check that we got a string.
  //     href =
  //       (typeof href == "string" &&
  //         URL.parse(href, aElement.ownerDocument.baseURI)?.href) ??
  //       null;
  //     if (href) {
  //       // Don't return the aElement we got href from since callers expect
  //       // <a>-like elements.
  //       return [href, null, aElement.ownerDocument.nodePrincipal];
  //     }
  //   }
  //   return null;
  // }
  let node = event.target;
  do {
    // TODO
    // @ts-ignore
    if (node.nodeType == node.ELEMENT_NODE) {
      let linkData = hrefAndLinkNodeForHTMLLink(node); //|| hrefAndLinkNodeForNonHTMLink(node);
      if (linkData) {
        return linkData;
      }
    }
    // TODO
    // @ts-ignore
    node = node.parentNode;
  } while (node);
  return [null, null, null];
}

/**
 * Extract the href from the link click event.
 * We look for HTMLAnchorElement, HTMLAreaElement, HTMLLinkElement,
 * HTMLInputElement.form.action, and nested anchor tags.
 * If the clicked element was a HTMLInputElement or HTMLButtonElement
 * we return the form action.
 *
 * @param {UIEvent} aEvent
 * @returns {string[]} a tuple [href, linkText] the url and the text for the link
 *   being clicked.
 */
function hRefForClickEvent(aEvent) {
  const target =
    aEvent.type == "command"
      ? // TODO: Check about commandDispatcher - do we still need this?
        // @ts-ignore
        document.commandDispatcher.focusedElement
      : aEvent.target;

  if (
    HTMLImageElement.isInstance(target) &&
    target.hasAttribute("overflowing")
  ) {
    // Click on zoomed image.
    return [null, null];
  }

  if (
    (HTMLInputElement.isInstance(target) ||
      HTMLButtonElement.isInstance(target)) &&
    /^https?/.test(target.form?.action)
  ) {
    return [target.form.action, null];
  }

  const [href, linkNode] = hrefAndLinkNodeForClickEvent(aEvent) ?? [];
  const labelNode = linkNode || target || null;
  const linkText = labelNode && gatherTextUnder(labelNode);
  return [href, linkText];
}

/**
 * Returns the href without the hash part.
 *
 * @param {string} href
 */

function hrefIgnoringHash(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return "";
  }

  url.hash = "";
  return url.href;
}

/**
 * Check whether the click target's or its ancestor's href
 * points to an anchor on the page.
 *
 * @param {HTMLElement} aTargetNode - The element node..
 * @returns {boolean} true if link pointing to anchor.
 */
function isLinkToAnchorOnPage(aTargetNode) {
  const url = aTargetNode.ownerDocument.URL;
  if (!url.startsWith("http")) {
    return false;
  }

  let linkNode = aTargetNode;
  while (linkNode && !HTMLAnchorElement.isInstance(linkNode)) {
    // TODO.
    // @ts-ignore
    linkNode = linkNode.parentNode;
  }

  // It's not a link with an anchor.
  // @ts-ignore
  if (!linkNode || !linkNode.href || !linkNode.hash) {
    return false;
  }

  // The link's href must match the document URL.
  // TODO.
  // @ts-ignore
  if (hrefIgnoringHash(linkNode.href) != hrefIgnoringHash(url)) {
    return false;
  }

  return true;
}

/**
 * Called whenever the user clicks in the content area,
 * should always return true for click to go through.
 *
 * @param {UIEvent} aEvent
 * @param {Function} getState
 * @returns {boolean}
 */
function contentAreaClick(aEvent, getState) {
  const target = aEvent.target;
  // TODO.
  // @ts-ignore
  if (target.localName == "browser") {
    // This is a remote browser. Nothing useful can happen in this process.
    return true;
  }

  // If we've loaded a web page url, and the element's or its ancestor's href
  // points to an anchor on the page, let the click go through.
  // Otherwise fall through and open externally.
  // TODO
  // @ts-ignore
  if (isLinkToAnchorOnPage(target)) {
    return true;
  }

  const [href, linkText] = hRefForClickEvent(aEvent);

  // if (!href && !aEvent.button) {
  //   // Is this an image that we might want to scale?

  //   if (target instanceof HTMLImageElement && target.src) {
  //     // Make sure it loaded successfully. No action if not or a broken link.
  //     var req = target.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
  //     if (!req || req.imageStatus & Ci.imgIRequest.STATUS_ERROR) {
  //       return false;
  //     }

  //     // Is it an image?
  //     if (target.localName == "img" && target.hasAttribute("overflowing")) {
  //       target.toggleAttribute("shrinktofit");
  //       return false;
  //     }
  //   }
  //   return true;
  // }

  // @ts-ignore
  if (!href || (MouseEvent.isInstance(aEvent) && aEvent.button == 2)) {
    return true;
  }

  // We want all about, http and https links in the message pane to be loaded
  // externally in a browser, therefore we need to detect that here and redirect
  // as necessary.
  const uri = new URL(href);
  if (
    // Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    //   .getService(Ci.nsIExternalProtocolService)
    //   .isExposedProtocol(uri.scheme) &&
    uri.protocol != "http:" &&
    uri.protocol != "https:"
  ) {
    return true;
  }

  // Now we're here, we know this should be loaded in an external browser, so
  // prevent the default action so we don't try and load it here.
  aEvent.preventDefault();

  let state = getState();
  browser.conversations
    .warnOnSuspiciousLinkClick({
      winId: state.summary.windowId,
      tabId: state.summary.tabId,
      href,
      linkText,
    })
    .then((urlPhishCheckResult) => {
      if (urlPhishCheckResult == 1) {
        return; // Block request
      }

      if (urlPhishCheckResult == 0) {
        // Use linkText instead.
        browser.windows.openDefaultBrowser(linkText);
      } else {
        browser.windows.openDefaultBrowser(href);
      }
    });
  return true;
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
          attachmentsPlural: messageUtils.getPlural(
            "attachments.numAttachments",
            numAttachments
          ),
          needsLateAttachments: false,
        })
      );
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
  // @ts-ignore
  selected({ id }) {
    // TODO: Do we still need this.
    return async () => {};
  },
  toggleConversationRead({ read }) {
    // @ts-ignore
    return async (dispatch, getState) => {
      const state = getState().messages;
      for (let msg of state.msgData) {
        browser.messages.update(msg.id, { read }).catch(console.error);
      }
    };
  },
  archiveConversation() {
    // @ts-ignore
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
    // @ts-ignore
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
    // @ts-ignore
    return (dispatch, getState) => {
      if ("contentAreaClick" in window.browsingContext.topChromeWindow) {
        // Hand this off to Thunderbird's content clicking algorithm as that's simplest.
        if (!window.browsingContext.topChromeWindow.contentAreaClick(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      } else if (!contentAreaClick(event, getState)) {
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
    // @ts-ignore
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
    // @ts-ignore
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
        for (let item of ["to", "cc", "bcc", "alternativeSender"]) {
          if (newMsg[item].length) {
            newMsg[item] = [];
            for (let contact of msg[item]) {
              if (contact.contactId == payload.contactId) {
                newMsg[item].push({ ...contact, avatar: payload.url });
              } else {
                newMsg[item].push(contact);
              }
            }
          }
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
