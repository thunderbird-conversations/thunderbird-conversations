/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getInitials } from "../esmodules/utils.mjs";
import { messageActions } from "./reducerMessages.mjs";

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

  let port = browser.runtime.connect({ name: "contacts" });

  let expectedContacts = new Map();

  function receiveContact(msg) {
    if (msg.type != "contactDetails") {
      return;
    }
    let resolve = expectedContacts.get(msg.for);
    if (resolve) {
      resolve(msg.contact);
    }
  }
  port.onMessage.addListener(receiveContact);

  // Build a map of all the contacts in the thread and de-dupe to avoid
  // hitting the cross-process messaging more than necessary.
  let contactMap = new Map();
  for (const message of msgData) {
    if (!("parsedLines" in message)) {
      continue;
    }

    for (const contacts of Object.values(message.parsedLines)) {
      for (const contact of contacts) {
        if (contactMap.has(contact.email)) {
          continue;
        }
        let promise = new Promise((resolve, reject) => {
          expectedContacts.set(contact.email, resolve);
          port.postMessage({
            type: "contactDetails",
            payload: contact,
          });
        });
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
          await promise
        );
      }
    }
  }

  port.onMessage.removeListener(receiveContact);
  port.disconnect();

  for (const message of msgData) {
    if (!("parsedLines" in message)) {
      continue;
    }
    // We want to fetch the detailed data about every contact in the `parsedLines` object.
    // So fetch all the data upfront.
    for (const [field, contacts] of Object.entries(message.parsedLines)) {
      const contactData = await Promise.all(
        contacts.map(async (contact) => [
          await contactMap.get(contact.email),
          // We need to keep the raw email around to format the data correctly
          contact.email,
          contact.name,
        ])
      );
      const formattedData = await Promise.all(
        contactData.map(([contact, email, name]) => {
          let data = enrichWithDisplayData({
            contact,
            email,
            field,
            nameFromEmail: name,
            showCondensed,
          });

          return data;
        })
      );
      // There is only ever one email in the `from` field. All the others are arrays.
      if (field == "from") {
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
  for (let field of ["from", "to", "cc", "bcc", "replyTo"]) {
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

export async function getContactPhotos(enrichedMsgs, dispatch) {
  // TODO: Maybe optimise for a page load, should we save contacts to a different
  // part of the reducer, so that we can load them as needed?
  let loadedPhotos = new Map();
  for (let msg of enrichedMsgs) {
    let from = msg.from;
    if (
      !from ||
      !from.contactId ||
      // No need to load if we already have the avatar.
      from.avatar
    ) {
      continue;
    }

    let url = loadedPhotos.get(from.contactId);
    if (!url) {
      let file = await browser.contacts.getPhoto(msg.from.contactId);
      if (file) {
        url = URL.createObjectURL(file);
        loadedPhotos.set(msg.from.contactId, URL.createObjectURL(file));
      }
    }
    if (!url) {
      continue;
    }

    dispatch(
      messageActions.addContactPhoto({
        id: msg.id,
        contactId: msg.from.contactId,
        url,
      })
    );
  }
}
