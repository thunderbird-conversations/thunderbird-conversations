/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from "../esmodules/thunderbirdCompat.js";
import { messageUtils } from "./messageUtils.js";

const RE_BZ_BUG_LINK = /^https:\/\/.*?\/show_bug.cgi\?id=[0-9]*/;
const RE_BZ_COMMENT = /^--- Comment #\d+ from .* \d{4}.*? ---([\s\S]*)/m;
const RE_LIST_POST = /<mailto:([^>]+)>/;

const kExpandNone = 1;
const kExpandAll = 3;
const kExpandAuto = 4;

// This is high because we want enough snippet to extract relevant data from
// bugzilla snippets.
const kSnippetLength = 700;

/**
 * Used to enrich basic message data with additional information for display.
 *
 * Some of these actions happen async, or are potentially expensive, which
 * is why there are here, rather than in the individual message display functions.
 */
export let messageEnricher = new (class {
  constructor() {
    this.pluralForm = browser.i18n.getMessage("pluralForm");
    this.numAttachmentsString = browser.i18n.getMessage(
      "attachments.numAttachments"
    );
    this.sizeUnknownString = browser.i18n.getMessage("attachments.sizeUnknown");
  }

  /**
   * Walk through each message in `msgData`, fetch and extend details about
   * each message. When the details are fetched, merge them into the
   * message object itself.
   *
   * @param {string} mode
   *   Can be "append", "replaceAll" or "replaceMsg". replaceMsg will replace
   *   only a single message.
   * @param {object[]} msgData
   *   The message details.
   * @param {object} summary
   *   The current state summary section from the store.
   * @param {number[]} selectedMessages
   *   The messages that are currently selected.
   */
  async enrich(mode, msgData, summary, selectedMessages) {
    this.loggingEnabled = summary.prefs.loggingEnabled;

    const userTags = await browser.messages.listTags();

    let msgs = await Promise.all(
      msgData.map(async (message) => {
        let msg = {};
        try {
          msg = await this._addDetailsFromHeader(
            summary.tabId,
            mode,
            message,
            userTags,
            selectedMessages
          );

          await this._parseMimeLines(message, msg);

          if (message.getFullRequired) {
            await this._getFullDetails(message, msg);
          } else {
            await this._addDetailsFromAttachments(
              message,
              msg,
              summary.prefs.extraAttachments
            );
          }
          this._adjustSnippetForBugzilla(message, msg);
          await messageEnricher._setDates(msg, summary);
        } catch (ex) {
          console.error("Could not process message:", ex);
          msg.invalid = true;
        }
        return msg;
      })
    );

    // Do expansion and scrolling after gathering the message data
    // as this relies on the message read information.
    if (mode != "replaceMsg") {
      if (mode == "replaceAll") {
        this._filterOutDuplicatesAndInvalids(msgs);

        this._expandAndScroll(
          msgs,
          selectedMessages,
          summary.tabId,
          summary.prefs.expandWho
        );
      } else {
        this._markMsgsToExpand(
          msgs,
          selectedMessages,
          -1,
          summary.prefs.expandWho,
          mode
        );
      }
    }
    return msgs;
  }

  /**
   * Figure out if there are duplicate or invalid messages and filter them out.
   * It decides which messages to keep and which messages to filter out.
   * This is needed because Gloda might return many copies of a single
   * message, each in a different folder.
   *
   * For different candidates for a single message id, we need to pick the
   * best one, giving precedence to those which are selected and/or in the
   * current view.
   *
   * Note: the array is modified in-place to avoid the need to re-update
   * state and dispatch messages. In future, we might want to make this
   * explicit.
   *
   * @param {object[]} msgData
   *   The message details.
   */
  _filterOutDuplicatesAndInvalids(msgData) {
    // First group the messages by the keys.
    let groupedMessages = new Map();
    for (let message of msgData) {
      if (message.invalid) {
        continue;
      }
      let id = message.glodaMessageId ?? message.messageHeaderId;
      let items = groupedMessages.get(id);
      if (!items) {
        groupedMessages.set(id, [message]);
      } else {
        items.push(message);
      }
    }

    // Now filter the groups.
    let i = 0;
    msgData.length = groupedMessages.size;
    for (let group of groupedMessages.values()) {
      if (!group.length) {
        console.error("Should not have empty group when filtering duplicates.");
        continue;
      }
      if (group.length == 1) {
        msgData[i++] = group[0];
        continue;
      }

      if (this.loggingEnabled) {
        console.log(
          "Filtering out duplicates:",
          group.map((m) => m.glodaMessageId ?? m.messageHeaderId)
        );
      }

      function findForCriterion(criterion) {
        for (let msg of group) {
          if (criterion(msg)) {
            return msg;
          }
        }
        return null;
      }

      let msg =
        // If it doesn't have a folderName it is in view.
        findForCriterion((msg) => !msg.folderName) ||
        findForCriterion((msg) => msg.isInbox) ||
        findForCriterion((msg) => msg.isSent) ||
        findForCriterion((msg) => msg.isArchives) ||
        // Worst case, fallback to the first one.
        group[0];

      // The message that's selected has the highest priority to avoid
      //  inconsistencies in case multiple identical messages are present in the
      //  same thread (e.g. message from to me).
      msgData[i++] = msg;
    }
  }

  /**
   * Figure out which messages need expanding, and which one we'll scroll to.
   *
   * @param {object[]} msgData
   *   The message details.
   * @param {object[]} selectedMessages
   *   The currently selected messages in the UI.
   * @param {number} tabId
   *   The current tab id.
   * @param {number} expandWho
   *   The value of the expandWho preference.
   */
  _expandAndScroll(msgData, selectedMessages, tabId, expandWho) {
    let focusThis = this._whereToScroll(msgData, selectedMessages);
    msgData[focusThis].scrollTo = true;
    this._markMsgsToExpand(
      msgData,
      selectedMessages,
      focusThis,
      expandWho,
      "expandAll"
    );
  }

  /**
   * Figure out which messages we should scroll to.
   *
   * @param {object[]} msgData
   *   The message details.
   * @param {object[]} selectedMessages
   *   The currently selected messages in the UI.
   */
  _whereToScroll(msgData, selectedMessages) {
    let needsScroll = -1;

    // Conversations stub UI is only displayed when a thread is selected,
    // or a single message. If different messages across threads are selected,
    // then Thunderbird's multi-select UI is displayed. Hence, if there's more
    // than one selected message, we know that we are in a threaded selection.
    if (selectedMessages.length > 1) {
      needsScroll = msgData.length - 1;
      for (let i = 0; i < msgData.length; ++i) {
        if (!msgData[i].read) {
          needsScroll = i;
          break;
        }
      }
    } else {
      let msgId = selectedMessages[0];
      for (let i = 0; i < msgData.length; ++i) {
        if (msgData[i].id == msgId) {
          needsScroll = i;
          break;
        }
      }
      // I can't see why we wouldn't break at some point in the loop below, but
      //  just in case...
      if (needsScroll < 0) {
        console.error("kScrollSelected && didn't find the selected message");
        needsScroll = msgData.length - 1;
      }
    }
    return needsScroll;
  }

  /**
   * Figure out which messages we should expand and mark them.
   *
   * @param {object[]} msgData
   *   The message details.
   * @param {object[]} selectedMessages
   *   The currently selected messages in the UI.
   * @param {number} focusIndex
   *   The message in the array to focus.
   * @param {number} expandWho
   *   The value of the expandWho preference.
   * @param {string} mode
   *   Can be "append", "replaceAll" or "replaceMsg". replaceMsg will replace
   *   only a single message.
   */
  _markMsgsToExpand(msgData, selectedMessages, focusIndex, expandWho, mode) {
    switch (expandWho) {
      default:
        console.error(
          false,
          `Unknown value '${expandWho}' for pref expandWho, try changing in the add-on preferences.`
        );
      // Falls through so we can default to the same as the pref and keep going.
      case kExpandAuto: {
        if (mode == "append") {
          // For all new appended messages, we expand them.
          for (let msg of msgData) {
            msg.expanded = true;
          }
        } else if (selectedMessages.length > 1) {
          // In this mode, we scroll to the first unread message (or the last
          //  message if all messages are read), and we expand all unread messages
          //  + the last one (which will probably be unread as well).
          for (let i = 0; i < msgData.length; i++) {
            msgData[i].expanded = !msgData[i].read || i == msgData.length - 1;
          }
        } else {
          // In this mode, we scroll to the selected message, and we only expand
          //  the selected message.
          for (let i = 0; i < msgData.length; i++) {
            msgData[i].expanded = i == focusIndex;
          }
        }
        break;
      }
      case kExpandAll: {
        for (const msg of msgData) {
          msg.expanded = true;
        }
        break;
      }
      case kExpandNone: {
        for (const msg of msgData) {
          msg.expanded = false;
        }
        break;
      }
    }
  }

  /**
   * Obtains the message header and adds the details of the message to it.
   *
   * @param {number} tabId
   *   The id of the current tab.
   * @param {string} mode
   *   Can be "append", "replaceAll" or "replaceMsg". replaceMsg will replace
   *   only a single message.
   * @param {object} message
   *   The message to get the additional details for.
   * @param {Array} userTags
   *   An array of the current tags the user has defined in Thunderbird.
   * @param {MessageHeader[]} selectedMessages
   *   An array of the currently selected messages.
   */
  async _addDetailsFromHeader(
    tabId,
    mode,
    message,
    userTags,
    selectedMessages
  ) {
    let msg = {
      id: message.id,
      initialPosition: message.initialPosition,
      type: message.type,
      // Needed to avoid de-duplicating at the wrong times.
      messageHeaderId: message.messageHeaderId,
      glodaMessageId: message.glodaMessageId,
      detailsShowing: message.detailsShowing,
      recipientsIncludeLists: message.recipientsIncludeLists,
    };
    const messageHeader = await browser.messages.get(message.id);
    if (!messageHeader) {
      throw new Error("Message no longer exists");
    }
    const messageFolderType = messageHeader.folder.type;

    msg.rawDate = messageHeader.date.getTime();
    // Only set hasRemoteContent for new messages, otherwise we cause a reload
    // of content each time when a message already has remote content.
    if (mode != "replaceMsg") {
      // We don't actually know until we load the message, so default to false,
      // we'll get notified if it should be true.
      msg.hasRemoteContent = false;
    }
    msg.smimeReload = false;
    msg.isPhishing = false;

    msg.folderAccountId = messageHeader.folder.accountId;
    msg.folderPath = messageHeader.folder.path;
    msg.isArchives = messageFolderType == "archives";
    msg.isDraft = messageFolderType == "drafts";
    msg.isInbox = messageFolderType == "inbox";
    msg.isJunk = messageHeader.junk;
    msg.isSent = messageFolderType == "sent";
    msg.isTemplate = messageFolderType == "templates";
    msg.isOutbox = messageFolderType == "outbox";
    msg.read = messageHeader.read;
    msg.subject = messageHeader.subject;
    msg.starred = messageHeader.flagged;

    msg.tags = messageHeader.tags.map((tagKey) => {
      // The fallback here shouldn't ever happen, but just in case...
      const tagDetails = userTags.find((t) => t.key == tagKey) || {
        color: "#FFFFFF",
        name: "unknown",
      };
      return {
        color: tagDetails.color,
        key: tagDetails.key,
        name: tagDetails.tag,
      };
    });

    // Only need to do this if the message is not in the current view.
    let isInView =
      selectedMessages.some((id) => id == message.id) ||
      (await browser.conversations.isInView(tabId, message.id));
    if (!isInView) {
      let parentFolders = await browser.folders.getParentFolders(
        messageHeader.folder
      );
      let folderName = messageHeader.folder.name;
      for (let folder of parentFolders) {
        folderName = folder.name + "/" + folderName;
      }
      msg.folderName = folderName;
      msg.shortFolderName = messageHeader.folder.name;
    }
    return msg;
  }

  /**
   * Get full details of a message. We typically need to do this for messages
   * not indexed by gloda, or for getting extra details for display (e.g.
   * headers).
   *
   * @param {object} message
   *   The message to get the full details for.
   * @param {object} msg
   *   The new message to put the details into.
   */
  async _getFullDetails(message, msg) {
    const fullMsg = await browser.messages.getFull(message.id);
    if (
      "list-post" in fullMsg.headers &&
      RE_LIST_POST.exec(fullMsg.headers["list-post"])
    ) {
      msg.recipientsIncludeLists = true;
    }

    if ("x-bugzilla-who" in fullMsg.headers) {
      msg.realFrom = msg.parsedLines.from[0]?.email;
      msg.parsedLines.from = await browser.conversations.parseMimeLine(
        fullMsg.headers["x-bugzilla-who"][0]
      );
    }

    function checkPart(msgPart) {
      switch (msgPart.contentType) {
        case "text/html":
          return { body: msgPart.body, html: true };
        case "text/plain":
          return { body: msgPart.body, html: false };
        case "multipart/alternative":
        case "multipart/related":
        case "multipart/mixed":
          // Sometimes we have seen that msgPart.parts might not exist when
          // initially loading a message. HAndle the error and continue so that
          // we can hopefully display something of the message even if we don't
          // have a summary.
          if (!msgPart.parts) {
            console.error("msgPart did not contain sub-parts");
            return { body: "", html: false };
          }
          for (let part of msgPart.parts.reverse()) {
            let info = checkPart(part);
            if (info.body?.length) {
              return info;
            }
          }
          break;
      }
      return { body: msgPart.body, html: true };
    }

    let info = checkPart(fullMsg.parts[0]);
    if (info.html && info.body) {
      msg.snippet = await browser.conversations.convertSnippetToPlainText(
        msg.folderAccountId,
        msg.folderPath,
        info.body
      );
    } else {
      msg.snippet = info.body ?? "";
    }

    msg.snippet = msg.snippet.substring(0, kSnippetLength);

    // TODO: Attachment display currently relies on having the URI for the
    // preview of the attachment. Since listAttachments doesn't give us that,
    // then we use getLateAttachments for now. If we can delay load the image
    // and insert it later, that'd probably be good enough.
    // let attachments = await browser.messages.listAttachments(message.id);
    // message.attachments = attachments.map((a) => {
    //   return {
    //     contentType: a.contentType,
    //     name: a.name,
    //     partName: a.partName,
    //     size: a.size,
    //   };
    // });

    await this._addDetailsFromAttachments(
      {
        attachments: await browser.conversations.getLateAttachments(
          message.id,
          false
        ),
        initialPosition: message.initialPosition,
      },
      msg
    );
  }

  /**
   * Handles parsing of the mime (to/cc/bcc/from) lines of a message.
   *
   * @param {object} message
   *   The message to get the additional details for.
   * @param {object} msg
   *   The new message to put the details into.
   */
  async _parseMimeLines(message, msg) {
    if (!message._contactsData) {
      return;
    }
    msg.parsedLines = {};
    for (let line of ["from", "to", "cc", "bcc"]) {
      msg.parsedLines[line] = message._contactsData[line]
        ? await browser.conversations.parseMimeLine(message._contactsData[line])
        : [];
    }
    let real = await browser.conversations.parseMimeLine(message.realFrom);
    msg.realFrom = real?.[0].email;
  }

  /**
   * Obtains attachment details and adds them to the message.
   *
   * @param {object} message
   *   The message to get the additional details for.
   * @param {number} message.initialPosition
   *   The initial position of the message.
   * @param {number} message.glodaMessageId
   *   The gloda message id.
   * @param {object[]} message.attachments
   *   The attachment data already extracted for the message.
   * @param {object} msg
   *   The new message to put the details into.
   * @param {boolean} extraAttachments
   *   Whether or not the user wants to display extra attachments.
   */
  async _addDetailsFromAttachments(
    { initialPosition, glodaMessageId, attachments },
    msg,
    extraAttachments
  ) {
    if (glodaMessageId && extraAttachments) {
      msg.needsLateAttachments = true;
    }

    let l = attachments.length;
    let newAttachments = [];

    for (let i = 0; i < l; i++) {
      const att = attachments[i];
      // This is bug 630011, remove when fixed
      let formattedSize = this.sizeUnknownString;
      // -1 means size unknown
      if (att.size != -1) {
        formattedSize = await browser.conversations.formatFileSize(att.size);
      }

      // We've got the right data, push it!
      newAttachments.push({
        size: att.size,
        contentType: att.contentType,
        formattedSize,
        name: att.name,
        partName: att.partName,
        url: att.url,
        anchor: "msg" + initialPosition + "att" + i,
      });
    }
    msg.attachments = newAttachments;
    msg.attachmentsPlural = l
      ? await browser.conversations.makePlural(
          this.pluralForm,
          this.numAttachmentsString,
          l
        )
      : "";
  }

  /**
   * Adjusts a message snippet for bugzilla - this removes information which
   * isn't very useful in the summary, and simplifies it.
   *
   * @param {object} message
   *   The message for which to simplify the snippet.
   * @param {object} msg
   *   The new message to put the details into.
   */
  _adjustSnippetForBugzilla(message, msg) {
    if (msg.snippet) {
      // If we already have a snippet, we probably got it whilst looking at
      // the full message, or from gloda.
      return;
    }
    if (message.type != "bugzilla") {
      msg.snippet = message.snippet;
      return;
    }

    let snippet = message.snippet;

    let m = snippet.match(RE_BZ_BUG_LINK);
    if (m?.[0]) {
      snippet = snippet.substring(m[0].trim().length);
    }
    m = snippet.match(RE_BZ_COMMENT);
    if (m?.length && m[1].trim().length) {
      snippet = m[1];
    }

    msg.snippet = snippet;
  }

  /**
   * A formatting function that uses Services.intl
   * to format a date just like in the message list
   *
   * @param {Date} date a javascript Date object
   * @returns {string} a string containing the formatted date
   */
  dateAsInMessageList(date) {
    const now = new Date();
    // Is it today?
    const isToday =
      now.getFullYear() == date.getFullYear() &&
      now.getMonth() == date.getMonth() &&
      now.getDate() == date.getDate();

    const formatter = isToday
      ? messageUtils.timeFormatter
      : messageUtils.dateAndTimeFormatter;
    return formatter.format(date);
  }

  /**
   * Sets dates in a message for display, setting according to the
   * no_friendly_date preference.
   *
   * @param {object} msg
   *   The new message to put the details into.
   * @param {object} summary
   *   The current summary details from the store state.
   */
  async _setDates(msg, summary) {
    let date = new Date(msg.rawDate);
    if (summary.prefs.noFriendlyDate) {
      msg.date = this.dateAsInMessageList(date);
      msg.fullDate = "";
    } else {
      msg.date = await browser.conversations.makeFriendlyDateAgo(
        date.getTime()
      );
      msg.fullDate = this.dateAsInMessageList(date);
    }
  }
})();
