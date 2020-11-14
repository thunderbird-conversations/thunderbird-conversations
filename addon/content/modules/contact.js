/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["ContactManager", "Contacts"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  getInitials: "chrome://conversations/content/utils.js",
  freshColor: "chrome://conversations/content/utils.js",
});

XPCOMUtils.defineLazyGetter(this, "browser", function () {
  return BrowserSim.getBrowser();
});

var Contacts = {
  kFrom: 0,
  kTo: 1,
};

function ContactManager() {
  this._cache = new Map();
  this._colorCache = new Map();
}

ContactManager.prototype = {
  async getContactFromNameAndEmail(name, email) {
    // [name] and [email] are from the message header
    email = (email + "").toLowerCase();
    // Might change in the future... who knows? ...
    let key = email;
    if (this._cache.has(key)) {
      if (name) {
        this._cache.get(key).enrichWithName(name);
      }
      return this._cache.get(key);
    }
    if (this._colorCache.has(key)) {
      // It is in the color cache, so we know that we don't have an address
      // book entry for it, so just form a contact from what we have.
      return new ContactFromAB(name, email, this._colorCache.get(email));
    }
    const contact = new ContactFromAB(name, email, this._colorCache.get(email));
    await contact.fetch();
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
  },
};

function ContactFromAB(name, email, color) {
  // Initialise to the original email, but it may be changed in fetch().
  this.emails = [email];
  this.color = color || freshColor(email);

  this._name = name; // Initially, the displayed name. Might be enhanced later.
  this._email = email; // The original email. Use to pick a gravatar.
  this._card = null;
  this._useCardName = false;
}

ContactFromAB.prototype = {
  async fetch() {
    let matchingCards = [];
    // See #1492. This attempts to catch errors from quickSearch that can
    // happen if there are broken address books.
    try {
      matchingCards = await browser.contacts.quickSearch(this._email);
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
    this._card = card;
    if (card) {
      // PreferDisplayName returns a literal string "0" or "1". We must convert it
      // to a boolean appropriately.
      this._useCardName =
        card.PreferDisplayName != null ? !!+card.PreferDisplayName : true;
      this.emails = [card.PrimaryEmail, card.SecondEmail || ""];
      // Prefer:
      // - displayName
      // - firstName lastName (if one of these is non-empty)
      // - the parsed name
      // - the email
      if (this._useCardName) {
        if (card.DisplayName) {
          this._name = card.DisplayName;
        } else {
          if (card.FirstName) {
            this._name = card.FirstName;
          }
          if (card.LastName) {
            if (this._name) {
              this._name += " " + card.LastName;
            } else {
              this._name = card.LastName;
            }
          }
        }
      }
      if (!this._name) {
        this._name = this._email;
      }
    } else {
      this.emails = [this._email];
      this._name = this._name || this._email;
    }
  },

  get avatar() {
    if (this._card) {
      let photoURI = this._card.PhotoURI || "";
      if (photoURI) {
        return photoURI;
      }
    }
    // It would be nice to return null here and let the UI sort out the default.
    // However, with the current version comparisons, that makes it hard to do.
    return "chrome://messenger/skin/addressbook/icons/contact-generic.svg";
  },

  /**
   * The `email` parameter is here because the same contact object is shared for
   * all instances of a contact, even though the original email address is
   * different. This allows one to share a common color for a same card in the
   * address book.
   */
  async toTmplData(position, email, isDetail) {
    const identityEmails = await browser.convContacts
      .getIdentityEmails({ includeNntpIdentities: false })
      .catch(console.error);
    const lcEmail = this._email.toLowerCase();
    const hasIdentity = identityEmails.find((e) => e.toLowerCase() == lcEmail);

    // `name` and `extra` are the only attributes that depend on `position`
    let name = this._name || this._email;
    let extra = "";
    if (!isDetail && hasIdentity) {
      name =
        position === Contacts.kFrom
          ? browser.i18n.getMessage("message.meFromMeToSomeone")
          : browser.i18n.getMessage("message.meFromSomeoneToMe");
      extra = this._email;
    }
    const displayEmail = name != email ? email : "";
    const skipEmail =
      !isDetail &&
      this._card &&
      (await browser.conversations.getCorePref("mail.showCondensedAddresses"));
    let tooltipName = this._name || this._email;
    if (hasIdentity) {
      tooltipName = browser.i18n.getMessage("message.meFromMeToSomeone");
    }

    let data = {
      name,
      initials: getInitials(name),
      displayEmail: skipEmail ? "" : displayEmail,
      tooltipName: tooltipName != email ? tooltipName : "",
      email,
      avatar: this.avatar,
      contactId: this._card ? this._card.id : null,
      extra,
      colorStyle: { backgroundColor: this.color },
    };
    return data;
  },

  enrichWithName(aName) {
    if (this._name == this._email || !this._name) {
      this._name = aName;
    }
  },
};
