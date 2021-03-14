/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from "../es-modules/thunderbird-compat.js";
import { getInitials } from "../es-modules/utils.js";

/**
 * The `email` parameter is here because the same contact object is shared for
 * all instances of a contact, even though the original email address is
 * different. This allows one to share a common color for a same card in the
 * address book.
 */
async function toTmplData(position, contact, email) {
  const identityEmails = await browser.convContacts
    .getIdentityEmails({ includeNntpIdentities: false })
    .catch(console.error);
  const lcEmail = contact._email.toLowerCase();
  const hasIdentity = identityEmails.find((e) => e.toLowerCase() == lcEmail);

  // `name` and `extra` are the only attributes that depend on `position`
  let name = contact._name || contact._email;
  let extra = "";
  if (hasIdentity) {
    name =
      position === "from"
        ? browser.i18n.getMessage("message.meFromMeToSomeone")
        : browser.i18n.getMessage("message.meFromSomeoneToMe");
    extra = contact._email;
  }
  const displayEmail = name != email ? email : "";
  const skipEmail =
    contact._card &&
    (await browser.conversations.getCorePref("mail.showCondensedAddresses"));
  let tooltipName = contact._name || contact._email;
  if (hasIdentity) {
    tooltipName = browser.i18n.getMessage("message.meFromMeToSomeone");
  }
  let data = {
    name,
    initials: getInitials(name),
    displayEmail: skipEmail ? "" : displayEmail,
    tooltipName: tooltipName != email ? tooltipName : "",
    email,
    avatar: contact.avatar,
    contactId: contact._card ? contact._card.id : null,
    extra,
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
        ])
      );
      const formattedData = await Promise.all(
        contactData.map(([contact, email]) => toTmplData(field, contact, email))
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
