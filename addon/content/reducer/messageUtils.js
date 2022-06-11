/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export let messageUtils = new (class {
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
   * @param {object} msg
   *   The message data from the store to respond to.
   * @returns {number}
   *   The identity id to use for the message.
   */
  async getBestIdentityForReply(msg) {
    let identityId = -1;
    for (let contact of [...msg.to, ...msg.cc, ...msg.bcc]) {
      if (contact.identityId) {
        identityId = contact.identityId;
        break;
      }
    }

    if (identityId == -1) {
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
})();
