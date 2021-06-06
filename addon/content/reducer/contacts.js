/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from "../es-modules/thunderbird-compat.js";
import { getInitials } from "../es-modules/utils.js";

/**
 * Adds necessary information for display contacts.
 *
 * @param {object} contact
 *   The contact details from the ContactManager.
 * @param {string} email
 *   The associated email for the contact.
 * @param {string} field
 *   The field of the email the contact is in, e.g. from, to, cc etc.
 * @param {string} nameFromEmail
 *   The name from the email address.
 * @param {boolean} showCondensed
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
    name,
    initials: getInitials(name),
    displayEmail: skipEmail ? "" : displayEmail,
    email,
    avatar: contact.photoURI,
    contactId: contact.contactId,
    colorStyle: { backgroundColor: contact.color },
  };
  return data;
}

/**
 * Walk through each message in `msgData` and fetch details about
 * each contact. When the details are fetched, merge them into the
 * message object itself.
 *
 * @export
 * @param {[object]} msgData
 */
export async function mergeContactDetails(msgData) {
  let showCondensed = await browser.conversations.getCorePref(
    "mail.showCondensedAddresses"
  );
  for (const message of msgData) {
    // We want to fetch the detailed data about every contact in the `_contactsData` object.
    // So fetch all the data upfront.
    for (const [field, contacts] of Object.entries(message._contactsData)) {
      const contactData = await Promise.all(
        contacts.map(async (contact) => [
          await browser._background.request({
            type: "contactDetails",
            payload: contact,
          }),
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
  }
}
