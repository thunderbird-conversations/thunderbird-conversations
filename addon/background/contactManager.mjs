/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @typedef {object} ContactNode
 * @see https://webextension-api.thunderbird.net/en/latest/contacts.html#contacts-contactnode
 */

/**
 * @typedef {object} Contact
 * @property {string} [color]
 *   A string denoting the color to use for this contact,, the same email address
 *   will always return the same color.
 * @property {string} [contactId]
 *   The id of the associated ContactNode from the WebExtension APIs (if any).
 * @property {string} [identityId]
 *   The id of the associated MailIdentiy from the WebExtension APIs (if any).
 * @property {string} [contactName]
 *   The name from the associated ContactNode. This is only returned if the
 *   ContactNode has "Always prefer display name over message header" set for
 *   the contact.
 * @property {string} [photoURI]
 *   A uri to use for the avator photo for the contact (if any).
 * @property {boolean} [readOnly]
 *   True if the card is read-only.
 */

/**
 * Extended Contact information that is cached.
 */
class ExtendedContact {
  constructor({
    color = undefined,
    contactId,
    // Email may be skipped if color is defined.
    email = undefined,
    identityId = undefined,
    contactName,
    photoURI,
    readOnly,
  }) {
    this.color = color ?? freshColor(email);
    this.contactId = contactId;
    this.identityId = identityId;
    this.contactName = contactName;
    this.photoURI = photoURI;
    this.readOnly = readOnly;
    /**
     * The time when the contact was last accessed in the cache, used for
     * clearing out the cache.
     *
     * @type {number}
     */
    this.lastAccessed = performance.now();
  }

  /**
   * Returns a direct copy of this contact.
   *
   * @returns {ExtendedContact}
   */
  clone() {
    return new ExtendedContact({
      color: this.color,
      contactId: this.contactId,
      identityId: this.identityId,
      contactName: this.contactName,
      photoURI: this.photoURI,
      readOnly: this.readOnly,
    });
  }

  /**
   * Returns a copy of the details for this contact which are used for display.
   *
   * @returns {Contact}
   */
  cloneAsContact() {
    return {
      color: this.color,
      contactId: this.contactId,
      identityId: this.identityId,
      contactName: this.contactName,
      photoURI: this.photoURI,
      readOnly: this.readOnly,
    };
  }
}

/**
 * A contact manager to cache the contacts retrieved from Thunderbird, and
 * associate them with colors.
 *
 * The cache also avoids expensive look-ups in the Thunderbird address book
 * database.
 */
export class ContactManager {
  constructor() {
    /**
     * Hard limit to the maximumsize of the cache for contacts - when we hit this
     * we will cleanup straight away.
     *
     * @type {number}
     */
    this.HARD_MAX_CACHE_SIZE = 1000;
    /**
     * When we do a soft cleanup, we'll cleanup by this amount of contacts.
     *
     * @type {number}
     */
    this.CACHE_CLEANUP_AMOUNT = 750;

    /**
     * This is a cache for the contacts, so that we don't keep re-requesting
     * them. The key is the email address.
     *
     * @type {Map<string, ExtendedContact>}
     */
    this._cache = new Map();
    /**
     * We may ask for the same contact twice in rapid succession. In this
     * case, we don't want to do queries multiple times. Instead we want to wait
     * for the first query to finish. So, we keep track of all active queries.
     * The key is the email address. The value is a promise which will resolve
     * to an ExtendedContact.
     *
     * @type {Map<string, Promise>}
     */
    this._activeFetches = new Map();

    browser.contacts.onCreated.addListener(this._contactCreated.bind(this));
    browser.contacts.onUpdated.addListener(this._contactUpdated.bind(this));
    browser.contacts.onDeleted.addListener(this._contactDeleted.bind(this));
  }

  init() {
    browser.runtime.onConnect.addListener((port) => {
      if (port.name == "contacts") {
        this.portFromContentScript = port;
        let handleMessage = async (msg) => {
          if (msg.type == "contactDetails") {
            let contact = await this.get(msg.payload.email);
            port.postMessage({
              type: "contactDetails",
              for: msg.payload.email,
              contact,
            });
          }
        };
        port.onMessage.addListener(handleMessage);
      }
    });
  }

  /**
   * Returns contact information for an email.
   *
   * @param {string} email
   *   The email address to get the contact information for.
   * @returns {Promise<Contact>}
   *   The contact information.
   */
  async get(email) {
    if (!email) {
      // We don't have anything, just return an empty object.
      return {};
    }
    email = email.toLocaleLowerCase();
    let cachedValue = this._cache.get(email);
    if (cachedValue) {
      cachedValue.lastAccessed = performance.now();
      return cachedValue;
    }

    let identityEmails = await this._getIdentityEmails();
    let activeFetch = this._activeFetches.get(email);
    if (activeFetch) {
      let { contact } = await activeFetch;
      contact.identityId = identityEmails.get(email);
      return contact.cloneAsContact();
    }

    let fetchPromise = this._fetchContactDetails(email);
    this._activeFetches.set(email, fetchPromise);

    let { emails, contact } = await fetchPromise;
    let contactResult = contact.clone();

    for (let contactEmail of emails) {
      let identityId = identityEmails.get(contactEmail);
      if (contactEmail == email) {
        contactResult.identityId = identityId;
        this._cache.set(contactEmail, contactResult);
      } else {
        let newContact = contact.clone();
        newContact.identityId = identityId;
        this._cache.set(contactEmail, newContact);
      }
    }

    let cacheSize = this._cache.size;
    if (cacheSize >= this.HARD_MAX_CACHE_SIZE) {
      // Schedule a cleanup after the current events.
      setTimeout(this._cleanupCache.bind(this), 0);
    }
    this._activeFetches.delete(email);

    return contactResult.cloneAsContact();
  }

  /**
   * Fetches contact details from the address book and account identity APIs.
   *
   * @param {string} email
   *   The email address to fetch contact details for.
   */
  async _fetchContactDetails(email) {
    let matchingCards = [];
    // See #1492. This attempts to catch errors from quickSearch that can
    // happen if there are broken address books.
    try {
      matchingCards = await browser.contacts.quickSearch({
        includeRemote: false,
        searchString: email,
      });
    } catch (ex) {
      console.error(ex);
    }

    // The search is only a quick search, therefore it might match email
    // addresses with prefixes or suffixes. Hence, we refine the matching cards
    // further here.
    matchingCards = matchingCards.filter(
      (c) =>
        c.properties.PrimaryEmail?.toLocaleLowerCase() == email ||
        c.properties.SecondEmail?.toLocaleLowerCase() == email
    );

    let contactId = undefined;
    /**
     * @type {string[]}
     */
    let emails = [];
    let contactName = undefined;
    let photoURI = undefined;
    let emailAddressForColor = email;
    let readOnly = false;

    if (matchingCards.length) {
      // We only look at the first contact.
      let card = matchingCards[0].properties;
      contactId = matchingCards[0].id;
      readOnly = !!matchingCards[0].readOnly;

      // PreferDisplayName returns a literal string "0" or "1". We must convert it
      // to a boolean appropriately.
      let useCardName =
        card.PreferDisplayName != null ? !!+card.PreferDisplayName : true;
      if (useCardName) {
        contactName = card.DisplayName;
      } else {
        if (card.FirstName) {
          contactName = card.FirstName;
        }
        if (card.LastName) {
          contactName += (contactName ? " " : "") + card.LastName;
        }
      }

      if (card.PrimaryEmail) {
        emails.push(card.PrimaryEmail);
        emailAddressForColor = card.PrimaryEmail;
      }
      if (card.SecondEmail) {
        emails.push(card.SecondEmail);
      }
      if (card.PhotoURI) {
        photoURI = card.PhotoURI;
      }
    } else {
      emails.push(email);
    }

    return {
      emails,
      contact: new ExtendedContact({
        contactId,
        email: emailAddressForColor,
        contactName,
        photoURI,
        readOnly,
      }),
    };
  }

  /**
   * Gets and caches the email addresses from the user's identities.
   *
   * Currently there is no refresh when account changes are made - Thunderbird
   * will need to be restart.
   */
  async _getIdentityEmails() {
    if (this._identityEmails) {
      return this._identityEmails;
    }

    /**
     * @type {Map<string, string>}
     */
    let emails = new Map();
    let accounts = await browser.accounts.list().catch((ex) => {
      console.error(ex);
      return [];
    });
    for (let account of accounts) {
      if (account.type == "nntp") {
        continue;
      }

      for (let identity of account.identities) {
        let idEmail = /** @type {string} */ (
          identity.email.toLocaleLowerCase()
        );
        // The default identity for the account is returned first, so
        // if subsequent identites have the same email, then skip them.
        if (!emails.has(idEmail)) {
          emails.set(idEmail, /** @type {string} */ (identity.id));
        }
      }
    }
    this._identityEmails = emails;
    return emails;
  }

  /**
   * Listener function for when a contact is created.
   *
   * @param {ContactNode} node
   *   The added contact.
   */
  _contactCreated(node) {
    this._cache.delete(node.properties.PrimaryEmail);
    this._cache.delete(node.properties.SecondEmail);
  }

  /**
   * Listener function for when a contact is updated.
   *
   * @param {ContactNode} node
   *   The updated contact.
   */
  _contactUpdated(node) {
    this._cache.delete(node.properties.PrimaryEmail);
    this._cache.delete(node.properties.SecondEmail);
  }

  /**
   * Listener function for when a contact is deleted.
   *
   * @param {string} parentId
   *   The parent id of the contact.
   * @param {string} id
   *   The id of the contact that was deleted.
   */
  _contactDeleted(parentId, id) {
    for (let [key, value] of this._cache.entries()) {
      if (value.contactId == id) {
        this._cache.delete(key);
      }
    }
  }

  /**
   * Removes old contacts from the cache to avoid it getting too large.
   */
  _cleanupCache() {
    let amountToRemove = this._cache.size - this.CACHE_CLEANUP_AMOUNT - 1;
    if (amountToRemove <= 0) {
      return;
    }

    let times = new Array(this._cache.size);
    let i = 0;
    for (let value of this._cache.values()) {
      times[i++] = value.lastAccessed;
    }

    times.sort((a, b) => a - b);

    for (let [key, value] of this._cache.entries()) {
      if (value.lastAccessed <= times[amountToRemove]) {
        this._cache.delete(key);
      }
    }
  }
}

export const contactManager = new ContactManager();

/**
 * Hash an email address to produce a color. The same email address will
 * always return the same color.
 *
 * @param {string} email
 * @returns {string} - valid css hsl(...) string
 */
export function freshColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    let chr = email.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash &= 0xffff;
  }
  let hue = Math.floor((360 * hash) / 0xffff);

  // try to provide a consistent lightness across hues
  let lightnessStops = [48, 25, 28, 27, 62, 42];
  let j = Math.floor(hue / 60);
  let l1 = lightnessStops[j];
  let l2 = lightnessStops[(j + 1) % 6];
  let lightness = Math.floor((hue / 60 - j) * (l2 - l1) + l1);

  return "hsl(" + hue + ", 70%, " + Math.floor(lightness) + "%)";
}
