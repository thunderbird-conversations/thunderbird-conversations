/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { freshColor } from "./utils.js";

class ContactManager {
  constructor() {
    this._cache = new Map();
    this._colorCache = new Map();
    // We may ask for the same contact twice in rapid succession. In this
    // case, we don't want to do queries multiple times. Instead we want to wait
    // for the first query to finish. So, we keep track of all active queries.
    this._activeFetches = new Map();
  }
  async getContactFromNameAndEmail({ name, email }) {
    // [name] and [email] are from the message header
    email = (email + "").toLowerCase();
    // Might change in the future... who knows? ...
    let key = email;
    if (this._cache.has(key)) {
      if (name) {
        this._enrichWithName(key, name);
      }
      return this._cache.get(key);
    }
    if (this._colorCache.has(key)) {
      // It is in the color cache, so we know that we don't have an address
      // book entry for it, so just form a contact from what we have.
      return {
        emails: [email],
        color: this._colorCache.get(email),
        _email: email,
        _name: name,
        _card: null,
        _useCardName: null,
        avatar: "chrome://messenger/skin/addressbook/icons/contact-generic.svg",
      };
    }

    if (this._activeFetches.has(key)) {
      // If there's an active fetch going on for this contact,
      // caching, etc. will be taken care of by the process that spawned the
      // fetch. Therefore, we can safely return the result of the promise directly.
      const contact = await this._activeFetches.get(key);
      return contact;
    }

    const contactPromise = this._fetchContactDetails(
      name,
      email,
      this._colorCache.get(email)
    );
    // Cache the promise until it's completed
    this._activeFetches.set(key, contactPromise);
    const contact = await contactPromise;
    if (name) {
      this._enrichWithName(key, name);
    }
    this._activeFetches.delete(key);

    // Only cache contacts which are in the address book. This avoids weird
    //  phenomena such as a bug tracker sending emails with different names
    //  but with the same email address, resulting in people all sharing the
    //  same name.
    // For those that need to be in the address book (because we want to
    //  display images, for instance), the user still has the option to uncheck
    //  "prefer display name over header name".
    if (contact._useCardName) {
      for (let email of contact.emails) {
        email = (email + "").toLowerCase();
        this._cache.set(key, contact);
      }
    } else if (!this._colorCache.has(email)) {
      // We still want to cache the color...
      this._colorCache.set(email, contact.color);
    }
    return contact;
  }

  /**
   * Add a `_name` field to the contact if one is not already present.
   *
   * @param {*} key
   * @param {*} name
   * @returns
   * @memberof ContactManager
   */
  _enrichWithName(key, name) {
    const contact = this._cache.get(key);
    if (!contact) {
      return;
    }
    if (contact._name === contact._email || !contact._name) {
      contact._name = name;
    }
  }

  /**
   * Fetch the details of a contact. This operation may be expensive.
   *
   * @param {*} name
   * @param {*} email
   * @returns
   * @memberof ContactManager
   */
  async _fetchContactDetails(name, email, color) {
    const ret = {
      emails: [email],
      color: color || freshColor(email),
      _email: email,
      _name: name,
      _card: null,
      _useCardName: null,
      avatar: "chrome://messenger/skin/addressbook/icons/contact-generic.svg",
    };
    let matchingCards = [];
    // See #1492. This attempts to catch errors from quickSearch that can
    // happen if there are broken address books.
    try {
      matchingCards = await browser.contacts.quickSearch(ret._email);
    } catch (ex) {
      console.error(ex);
    }
    let card =
      matchingCards.length !== 0
        ? {
            ...matchingCards[0].properties,
            id: matchingCards[0].id,
          }
        : null;
    ret._card = card;
    if (card) {
      // PreferDisplayName returns a literal string "0" or "1". We must convert it
      // to a boolean appropriately.
      ret._useCardName =
        card.PreferDisplayName != null ? !!+card.PreferDisplayName : true;
      ret.emails = [card.PrimaryEmail, card.SecondEmail || ""];
      // Prefer:
      // - displayName
      // - firstName lastName (if one of these is non-empty)
      // - the parsed name
      // - the email
      if (ret._useCardName) {
        if (card.DisplayName) {
          ret._name = card.DisplayName;
        } else {
          if (card.FirstName) {
            ret._name = card.FirstName;
          }
          if (card.LastName) {
            if (ret._name) {
              ret._name += " " + card.LastName;
            } else {
              ret._name = card.LastName;
            }
          }
        }
      }
      if (!ret._name) {
        ret._name = ret._email;
      }
    } else {
      ret.emails = [ret._email];
      ret._name = ret._name || ret._email;
    }
    ret.avatar =
      ret._card?.PhotoURI ||
      "chrome://messenger/skin/addressbook/icons/contact-generic.svg";

    return ret;
  }
}

export const contactManager = new ContactManager();
