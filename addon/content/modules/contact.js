/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["ContactManager", "Contacts", "defaultPhotoURI"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
  getInitials: "chrome://conversations/content/utils.js",
  freshColor: "chrome://conversations/content/utils.js",
});

var Contacts = {
  kFrom: 0,
  kTo: 1,
};

const defaultPhotoURI =
  "chrome://messenger/skin/addressbook/icons/contact-generic.png";

/*
 * Searches a given email address in all identities and returns the corresponding identity.
 * @param {String} anEmailAddress Email address to be searched in the identities
 * @returns {{Boolean} isDefault, {{nsIMsgIdentity} identity} if found, otherwise undefined
 */
async function getIdentityForEmail(email) {
  const browser = BrowserSim.getBrowser();
  const identities = await browser.convContacts
    .getIdentities({ includeNntpIdentities: true })
    .catch(console.error);
  return identities.find(
    ident => ident.identity.email.toLowerCase() == email.toLowerCase()
  );
}

function ContactManager() {
  this._cache = {};
  this._colorCache = {};
  this._count = 0;
}

ContactManager.prototype = {
  getContactFromNameAndEmail(name, email, position) {
    // [name] and [email] are from the message header
    let self = this;
    email = (email + "").toLowerCase();
    // Might change in the future... who knows? ...
    let key = email;
    let cache = function _cache(name, contact) {
      for (let email of contact.emails) {
        email = (email + "").toLowerCase();
        self._cache[key] = contact;
      }
    };
    if (key in this._cache) {
      if (name) {
        this._cache[key].enrichWithName(name);
      }
      return this._cache[key];
    }

    let contact = new ContactFromAB(
      this,
      name,
      email,
      position,
      this._colorCache[email]
    );
    // Only cache contacts which are in the address book. This avoids weird
    //  phenomena such as a bug tracker sending emails with different names
    //  but with the same email address, resulting in people all sharing the
    //  same name.
    // For those that need to be in the address book (because we want to
    //  display images, for instance), the user still has the option to uncheck
    //  "prefer display name over header name".
    if (contact._useCardName) {
      cache(name, contact);
    } else if (!(email in this._colorCache)) {
      // We still want to cache the color...
      this._colorCache[email] = contact.color;
    }
    return contact;
  },
};

function ContactFromAB(manager, name, email, /* unused */ position, color) {
  this.emails = [];
  this.color = color || freshColor(email);

  this._manager = manager;
  this._name = name; // Initially, the displayed name. Might be enhanced later.
  this._email = email; // The original email. Use to pick a gravatar.
  this._card = null;
  this._useCardName = false;

  this.fetch();
}

ContactFromAB.prototype = {
  async fetch() {
    const browser = BrowserSim.getBrowser();

    const matchingCards = await browser.contacts.quickSearch(this._email);
    let card = matchingCards.length !== 0 ? matchingCards[0].properties : null;
    this._card = card;
    if (card) {
      // PreferDisplayName returns a literal string "0" or "1". We must convert it
      // to a boolean appropriately.
      this._useCardName =
        card.PreferDisplayName != null ? !!+card.PreferDisplayName : true;
      this.emails = [card.primaryEmail, card.SecondEmail || ""];
      // Prefer:
      // - displayName
      // - firstName lastName (if one of these is non-empty)
      // - the parsed name
      // - the email
      if (this._useCardName && card.displayName) {
        this._name = card.displayName;
      }
      if (this._useCardName && (card.firstName || card.lastName)) {
        this._name = card.firstName + " " + card.lastName;
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
    return defaultPhotoURI;
  },

  /**
   * The `email` parameter is here because the same contact object is shared for
   * all instances of a contact, even though the original email address is
   * different. This allows one to share a common color for a same card in the
   * address book.
   */
  async toTmplData(useColor, position, email, isDetail) {
    const browser = BrowserSim.getBrowser();

    let [name, extra] = await this.getName(position, isDetail);
    let displayEmail = name != email ? email : "";
    let hasCard = this._card != null;
    let skipEmail =
      !isDetail &&
      hasCard &&
      (await browser.conversations.getCorePref("mail.showCondensedAddresses"));
    let tooltipName = await this.getTooltipName(position);
    let data = {
      name,
      initials: getInitials(name),
      displayEmail: skipEmail ? "" : displayEmail,
      tooltipName: tooltipName != email ? tooltipName : "",
      email,
      avatar: this.avatar,
      avatarIsDefault: this.avatar.substr(0, 6) === "chrome",
      hasCard,
      extra,
      // Parameter aUseColor is optional, and undefined means true
      colorStyle: useColor === false ? {} : { backgroundColor: this.color },
    };
    return data;
  },

  async getTooltipName(aPosition) {
    const browser = BrowserSim.getBrowser();

    if (aPosition !== Contacts.kFrom && aPosition !== Contacts.kTo) {
      throw new Error("Someone did not set the 'position' properly");
    }
    if (await getIdentityForEmail(this._email)) {
      return browser.i18n.getMessage("message.meFromMeToSomeone");
    }

    return this._name || this._email;
  },

  async getName(aPosition, aIsDetail) {
    const browser = BrowserSim.getBrowser();
    if (aPosition !== Contacts.kFrom && aPosition !== Contacts.kTo) {
      throw new Error("Someone did not set the 'position' properly");
    }
    if ((await getIdentityForEmail(this._email)) && !aIsDetail) {
      let display =
        aPosition === Contacts.kFrom
          ? browser.i18n.getMessage("message.meFromMeToSomeone")
          : browser.i18n.getMessage("message.meFromSomeoneToMe");

      let identities = await browser.convContacts
        .getIdentities()
        .catch(console.error);
      return [display, identities.length > 1 ? this._email : ""];
    }

    return [this._name || this._email, ""];
  },

  enrichWithName(aName) {
    if (this._name == this._email || !this._name) {
      this._name = aName;
    }
  },
};
