/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from "../es-modules/thunderbird-compat.js";
import { getInitials } from "../es-modules/utils.js";

/**
 * Adds necessary information for display contacts.
 *
 * @param {object} root0
 * @param {object} root0.contact
 *   The contact details from the ContactManager.
 * @param {string} root0.email
 *   The associated email for the contact.
 * @param {string} root0.field
 *   The field of the email the contact is in, e.g. from, to, cc etc.
 * @param {string} root0.nameFromEmail
 *   The name from the email address.
 * @param {boolean} root0.showCondensed
 *   Whether or not to show condensed names.
 */
async function enrichWithDisplayData({
  contact,
  email,
  field,
  nameFromEmail,
  showCondensed,
}) {
  // `name` is the only attribute that depend on `position`
  let name = contact.name || nameFromEmail || email;
  if (contact.identityId !== undefined) {
    name =
      field === "from"
        ? browser.i18n.getMessage("message.meFromMeToSomeone")
        : browser.i18n.getMessage("message.meFromSomeoneToMe");
  }
  const displayEmail = name != email ? email : "";
  const skipEmail = contact.contactId !== undefined && showCondensed;
  let data = {
    avatar: contact.photoURI,
    colorStyle: { backgroundColor: contact.color },
    contactId: contact.contactId,
    displayEmail: skipEmail ? "" : displayEmail,
    email,
    identityId: contact.identityId,
    initials: getInitials(name),
    name,
    readOnly: contact.readOnly,
  };
  return data;
}

/**
 * Walk through each message in `msgData` and fetch details about
 * each contact. When the details are fetched, merge them into the
 * message object itself.
 *
 * @param {object[]} msgData
 */
export async function mergeContactDetails(msgData) {
  let showCondensed = await browser.conversations.getCorePref(
    "mail.showCondensedAddresses"
  );

  // Build a map of all the contacts in the thread and de-dupe to avoid
  // hitting the cross-process messaging more than necessary.
  let contactMap = new Map();
  for (const message of msgData) {
    for (const contacts of Object.values(message._contactsData)) {
      for (const contact of contacts) {
        if (contactMap.has(contact.email)) {
          continue;
        }
        contactMap.set(
          contact.email,
          // This is designed to not await on the request. However, in the
          // Thunderbird betas around TB 90 / 91, performing multiple requests
          // at the same time would break if an LDAP address book is loaded due
          // to https://bugzilla.mozilla.org/show_bug.cgi?id=1716861
          //
          // Once that is fixed, we should investigate making these happen
          // in parallel again. The performance impact probably isn't massive,
          // but did seem to be more stable.
          await browser._background.request({
            type: "contactDetails",
            payload: contact,
          })
        );
      }
    }
  }

  for (const message of msgData) {
    // We want to fetch the detailed data about every contact in the `_contactsData` object.
    // So fetch all the data upfront.
    for (const [field, contacts] of Object.entries(message._contactsData)) {
      const contactData = await Promise.all(
        contacts.map(async (contact) => [
          await contactMap.get(contact.email),
          // We need to keep the raw email around to format the data correctly
          contact.email,
          contact.name,
        ])
      );
      const formattedData = await Promise.all(
        contactData.map(([contact, email, name]) =>
          enrichWithDisplayData({
            contact,
            email,
            field,
            nameFromEmail: name,
            showCondensed,
          })
        )
      );
      // There is only ever one email in the `from` field. All the others are arrays.
      if (field === "from") {
        message[field] = formattedData[0];
      } else {
        message[field] = formattedData;
      }
    }

    message.multipleRecipients = hasMultipleRecipients(message);
  }
}

/**
 * Determines if a message has multiple recipients or not. Filters out contacts
 * which have an identity, as they are from the active user.
 *
 * @param {object} message
 *   The message to check the contacts within.
 * @returns {boolean}
 *   Returns true if there is more than one recipient.
 */
function hasMultipleRecipients(message) {
  let seen = new Set();
  let count = 0;
  for (let field of ["from", "to", "cc", "bcc"]) {
    // TODO: The ?? and subsequent !contact currently helps some of the tests to pass.
    let contacts = (field == "from" ? [message[field]] : message[field]) ?? [];
    for (let contact of contacts) {
      if (!contact || contact.identityId) {
        continue;
      }
      if (!seen.has(contact.email)) {
        count++;
      }
      seen.add(contact.email);
    }
  }
  return count > 1;
}
