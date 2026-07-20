/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @import {storeUtils} from "./storeUtils.mjs"
 */

export let messageUtils = new (class {
  /**
   * @type {typeof storeUtils.store}
   */
  store;

  /** @type {Intl.PluralRules} */
  #pluralRules;

  constructor() {
    this.timeFormatter = new Intl.DateTimeFormat(undefined, {
      timeStyle: "short",
    });
    this.dateAndTimeFormatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
    this.dateFormatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
    });
  }

  /**
   * Returns the best identity to use when replying to a message.
   *
   * @param {number} msgId
   *   The message id to get the data from.
   * @returns {Promise<string>}
   *   The identity id to use for the message.
   */
  async getBestIdentityForReply(msgId) {
    let msg = this.store.getState().messages.msgData.find((m) => m.id == msgId);
    let identityId = "";
    for (let contact of [...msg.to, ...msg.cc, ...msg.bcc]) {
      if (contact.identityId) {
        identityId = contact.identityId;
        break;
      }
    }

    if (!identityId) {
      let account = await browser.accounts.get(msg.folderAccountId);
      if (!account?.identities.length) {
        let defaultAccount = await browser.accounts.getDefault();
        let identityDetail = await browser.identities.getDefault(
          defaultAccount.id
        );
        identityId = identityDetail.id;
      } else {
        identityId = (await browser.identities.getDefault(account.id)).id;
      }
    }

    return identityId;
  }

  async getParamsForCompose(msgId, shiftKey) {
    let identityId = await messageUtils.getBestIdentityForReply(msgId);
    let params = {
      identityId,
    };
    if (shiftKey) {
      let identity = await browser.identities.get(identityId);
      params.isPlainText = identity.composeHtml;
    }
    return params;
  }

  getPlural(stringPrefix, quantity) {
    if (!this.#pluralRules) {
      this.#pluralRules = new Intl.PluralRules(browser.i18n.getUILanguage());
    }
    return browser.i18n.getMessage(
      `${stringPrefix}_${this.#pluralRules.select(quantity)}`,
      [quantity]
    );
  }

  /**
   * Detaches an attachment from a message.
   *
   * @param {object} options
   * @param {number} options.msgId
   * @param {string} [options.fileName]
   * @param {string} options.partName
   * @param {boolean} options.shouldSave
   */
  async detachAttachment({ msgId, fileName = null, partName, shouldSave }) {
    if (!shouldSave) {
      if (
        window.confirm(
          browser.i18n.getMessage("attachments.delete.warning", [
            `\n${fileName}\n`,
          ])
        )
      ) {
        await browser.messages.deleteAttachments(msgId, [partName]);
      }
      return;
    }

    let state = this.store.getState();
    let options = {
      msgId,
      partName,
    };
    if (state.summary.isStandalone) {
      options.winId = state.summary.windowId;
    } else {
      options.tabId = state.summary.tabId;
    }
    await browser.conversations.detachAttachment(options);
  }

  /**
   * Handles opening a compose window to reply to a message.
   *
   * @param {number} msgId
   * @param {boolean} shiftKey
   * @param {string} [type]
   */
  async replyMessage(msgId, shiftKey, type) {
    const mode = {
      reply: "replyToSender",
      replyAll: "replyToAll",
      replyList: "replyToList",
    };
    let params = await this.getParamsForCompose(msgId, shiftKey);
    browser.compose.beginReply(msgId, mode[type], params).catch(console.error);
  }

  /**
   * Handles opening a compose window to forward to a message.
   *
   * @param {number} msgId
   * @param {boolean} shiftKey
   */
  async forwardMessage(msgId, shiftKey) {
    let forwardMode =
      (await browser.conversations.getCorePref("mail.forward_message_mode")) ??
      0;
    let params = await this.getParamsForCompose(msgId, shiftKey);
    browser.compose
      .beginForward(
        msgId,
        forwardMode == 0 ? "forwardAsAttachment" : "forwardInline",
        params
      )
      .catch(console.error);
  }

  /**
   * Handles opening a compose window to edit a message as new.
   *
   * @param {number} msgId
   * @param {boolean} shiftKey
   */
  async editAsNew(msgId, shiftKey) {
    let params = await messageUtils.getParamsForCompose(msgId, shiftKey);
    browser.compose.beginNew(msgId, params);
  }

  /**
   * Handles a tag click notification.
   *
   * @param {number} msgId
   * @param {object} details
   * @param {string} details.type
   */
  async handleTagClick(msgId, details) {
    if (details.type == "enigmail") {
      await browser.convOpenPgp.handleTagClick(
        this.store.getState().summary.tabId,
        msgId
      );
      return;
    }
    console.error("Unsupported click type", details.type);
  }

  /**
   * Handles switching to a specific folder and message.
   *
   * @param {number} msgId
   */
  switchToFolderAndMsg(msgId) {
    browser.mailTabs.setSelectedMessages(this.store.getState().summary.tabId, [
      msgId,
    ]);
  }
})();
