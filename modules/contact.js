/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

var EXPORTED_SYMBOLS = ["ContactManager", "Contacts", "defaultPhotoURI"];

ChromeUtils.import("resource:///modules/StringBundle.js"); // for StringBundle
const {MailServices} = ChromeUtils.import("resource:///modules/mailServices.js", {});
const {GlodaUtils} = ChromeUtils.import("resource:///modules/gloda/utils.js", {});
const {Gloda} = ChromeUtils.import("resource:///modules/gloda/gloda.js", {});

const {composeMessageTo} = ChromeUtils.import("resource://conversations/modules/stdlib/compose.js", {});
const {getIdentities, getIdentityForEmail, MixIn, sanitize } =
  ChromeUtils.import("resource://conversations/modules/stdlib/misc.js", {});
// ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js");
const {setupLogging} = ChromeUtils.import("resource://conversations/modules/log.js", {});
const {Prefs} = ChromeUtils.import("resource://conversations/modules/prefs.js", {});
const {EventHelperMixIn, topMail3Pane} = ChromeUtils.import("resource://conversations/modules/misc.js", {});

const clipboardService = Cc["@mozilla.org/widget/clipboardhelper;1"]
                         .getService(Ci.nsIClipboardHelper);

var Contacts = {
  kFrom: 0,
  kTo: 1,
};

const defaultPhotoURI = "chrome://messenger/skin/addressbook/icons/contact-generic.png";

let Log = setupLogging("Conversations.Contact");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

// Taken from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt#Fixing_charAt()_to_support_non-Basic-Multilingual-Plane_(BMP)_characters
function fixedCharAt(str, idx) {
  var ret = "";
  str += "";
  var end = str.length;

  var surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  while ((surrogatePairs.exec(str)) != null) {
    var li = surrogatePairs.lastIndex;
    if (li - 2 < idx) {
      idx++;
    } else {
      break;
    }
  }

  if (idx >= end || idx < 0) {
    return "";
  }

  ret += str.charAt(idx);

  if (/[\uD800-\uDBFF]/.test(ret) && /[\uDC00-\uDFFF]/.test(str.charAt(idx + 1))) {
    // Go one further, since one of the "characters" is part of a surrogate pair
    ret += str.charAt(idx + 1);
  }
  return ret;
}

/**
 * If `name` is an email address, get the part before the @.
 * Then, capitalize the first letter of the first and last word (or the first
 * two letters of the first word if only one exists).
 */
function getInitials(name) {
  name = name.trim().split("@")[0];
  let words = name.split(/[ .\-_]/).filter(function(word) {
    return word;
  });
  let initials = "??";
  let n = words.length;
  if (n == 1) {
    initials = words[0].substr(0, 2);
  } else if (n > 1) {
    initials = fixedCharAt(words[0], 0) + fixedCharAt(words[n - 1], 0);
  }
  return initials.toUpperCase();
}

function ContactManager() {
  this._cache = {};
  this._colorCache = {};
  this._count = 0;
}

ContactManager.prototype = {
  getContactFromNameAndEmail: function _ContactManager_getContactFromEmail(name, email, position) {
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
      if (name)
        this._cache[key].enrichWithName(name);
      return this._cache[key];
    }

    let contact = new ContactFromAB(this, name, email, position, this._colorCache[email]);
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

let ContactMixIn = {
  /**
   * The aEmail parameter is here because the same contact object is shared for
   * all instances of a contact, even though the original email address is
   * different. This allows one to share a common color for a same card in the
   * address book.
   */
  toTmplData: function _ContactMixIn_toInlineHtml(aUseColor, aPosition, aEmail, aIsDetail) {
    let [name, extra] = this.getName(aPosition, aIsDetail);
    let displayEmail = (name != aEmail ? aEmail : "");
    let hasCard = (this._card != null);
    let skipEmail = !aIsDetail && hasCard && Prefs.getBool("mail.showCondensedAddresses");
    let tooltipName = this.getTooltipName(aPosition);
    let data = {
      showMonospace: aPosition == Contacts.kFrom,
      name: sanitize(name),
      initials: getInitials(sanitize(name)),
      displayEmail: sanitize(skipEmail ? "" : displayEmail),
      tooltipName: sanitize((tooltipName != aEmail) ? tooltipName : ""),
      email: sanitize(aEmail),
      avatar: sanitize(this.avatar),
      avatarIsDefault: this.avatar.substr(0, 6) === "chrome",
      profiles: this._profiles,
      extra,
      // Parameter aUseColor is optional, and undefined means true
      colorStyle: ((aUseColor === false)
        ? ""
        : ("background-color :" + this.color)),
      writeBr: aIsDetail,
      star: aIsDetail && hasCard,
    };
    return data;
  },

  onAddedToDom: function _ContactMixIn_onAddedToDom(aDomNode) {
    let self = this;
    this._domNode = aDomNode; // makes the line below possible
    let mainWindow = topMail3Pane(this);

    aDomNode.parentNode.getElementsByClassName("moreExpander")[0].addEventListener("click", function(event) {
      if (aDomNode.parentNode.getElementsByClassName("hiddenFooter")[0].style.display == "none") {
        aDomNode.parentNode.getElementsByClassName("hiddenFooter")[0].style.display = "block";
        event.originalTarget.classList.add("is-open");
      } else {
        aDomNode.parentNode.getElementsByClassName("hiddenFooter")[0].style.display = "none";
        event.originalTarget.classList.remove("is-open");
      }
      event.stopPropagation();
    });

    /* Register the "send message" link */
    this.register(".sendEmail", function(event) {
      let dest = (this._name == this._email || !this._name)
        ? this._email
        : MailServices.headerParser.makeMimeAddress(this._name, this._email);
      dump(dest + "\n\n");
      composeMessageTo(dest, mainWindow.gFolderDisplay.displayedFolder);
      event.stopPropagation();
    }.bind(this));

    // XXX We already called getCardForEmail if we're runnning without contacts
    //  installed...
    // Please note that cardAndBook is never overridden, so that the closure for
    //  the editContact event listener actually sees the updated fields of the
    //  object once the addContact event listener has updated them.
    let cardAndBook = mainWindow.getCardForEmail(self._email);
    if (cardAndBook.card)
      aDomNode.parentNode.classList.add("inAddressBook");
    this.register(".addContact", function(event) {
      let args = {
        primaryEmail: self._email,
        displayName: self._name,
        allowRemoteContent: true,
        // This is too messed up, there's no easy way to interact with this
        //  dialog, just forget about it. RegisterSaveListener seems to be
        //  uncallable... and okCallback just short-circuit the whole logic
      };
      mainWindow.openDialog(
        "chrome://messenger/content/addressbook/abNewCardDialog.xul",
        "", "chrome,resizable=no,titlebar,modal,centerscreen", args
      );
      // This is an approximation, but it should be good enough
      let newCardAndBook = mainWindow.getCardForEmail(self._email);
      if (newCardAndBook.card) {
        cardAndBook.card = newCardAndBook.card;
        cardAndBook.book = newCardAndBook.book;
        aDomNode.parentNode.classList.add("inAddressBook");
      }
    });
    this.register(".editContact", function(event) {
      let args = {
        abURI: cardAndBook.book.URI,
        card: cardAndBook.card,
      };
      mainWindow.openDialog(
        "chrome://messenger/content/addressbook/abEditCardDialog.xul",
        "", "chrome,modal,resizable=no,centerscreen", args
      );
    });
    this.register(".copyEmail", function(event) {
      clipboardService.copyString(self._email);
    });
    this.register(".showInvolving", function(event) {
      let q1 = Gloda.newQuery(Gloda.NOUN_IDENTITY);
      q1.kind("email");
      q1.value(self._email);
      q1.getCollection({
        onItemsAdded: function _onItemsAdded(aItems, aCollection) { },
        onItemsModified: function _onItemsModified(aItems, aCollection) { },
        onItemsRemoved: function _onItemsRemoved(aItems, aCollection) { },
        onQueryCompleted: function _onQueryCompleted(aCollection) {
          if (!aCollection.items.length)
            return;

          let q2 = Gloda.newQuery(Gloda.NOUN_MESSAGE);
          q2.involves.apply(q2, aCollection.items);
          q2.getCollection({
            onItemsAdded: function _onItemsAdded(aItems, aCollection) { },
            onItemsModified: function _onItemsModified(aItems, aCollection) { },
            onItemsRemoved: function _onItemsRemoved(aItems, aCollection) { },
            onQueryCompleted: function _onQueryCompleted(aCollection) {
              let tabmail = mainWindow.document.getElementById("tabmail");
              tabmail.openTab("glodaList", {
                collection: aCollection,
                title: strings.get("involvingTabTitle").replace("#1", self._name),
                background: false,
              });
            },
          });
        },
      });
    });
    this.register(".createFilter", function(event) {
      mainWindow.MsgFilters(self._email, null);
    });

    /* The links to various profiles */
    for (let a1 of aDomNode.getElementsByTagName("a")) {
      let a = a1;
      a.addEventListener("click",
        a.classList.contains("profile-link")
        ? (event) => {
            mainWindow.document.getElementById("tabmail").openTab("contentTab", {
              contentPage: a.href,
              clickHandler: "specialTabs.defaultClickHandler(event);",
            });
            event.preventDefault();
          }
        : (event) => {
            mainWindow.specialTabs.siteClickHandler(event, /^mailto:/);
            event.preventDefault();
          });
    }
  },

  getTooltipName: function _ContactMixIn_getName(aPosition) {
    Log.assert(aPosition === Contacts.kFrom || aPosition === Contacts.kTo,
      "Someone did not set the 'position' properly");
    if (getIdentityForEmail(this._email)) {
      return strings.get("meFromMeToSomeone");
    }

    return this._name || this._email;
  },

  getName: function _ContactMixIn_getName(aPosition, aIsDetail) {
    Log.assert(aPosition === Contacts.kFrom || aPosition === Contacts.kTo,
      "Someone did not set the 'position' properly");
    if (getIdentityForEmail(this._email) && !aIsDetail) {
      let display = ((aPosition === Contacts.kFrom)
        ? strings.get("meFromMeToSomeone")
        : strings.get("meFromSomeoneToMe")
      );
      return [display, getIdentities().length > 1 ? this._email : ""];
    }

    return [this._name || this._email, ""];
  },

  enrichWithName: function _ContactMixIn_enrichWithName(aName) {
    if (this._name == this._email || !this._name)
      this._name = aName;
  },
};

function freshColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    let chr = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash &= 0xffff;
  }
  let hue = Math.floor(360 * hash / 0xffff);

  // try to provide a consistent lightness across hues
  let lightnessStops = [48, 25, 28, 27, 62, 42];
  let j = Math.floor(hue / 60);
  let l1 = lightnessStops[j];
  let l2 = lightnessStops[(j + 1) % 6];
  let lightness = Math.floor((hue / 60 - j) * (l2 - l1) + l1);

  return "hsl(" + hue + ", 70%, " + Math.floor(lightness) + "%)";
}

function ContactFromAB(manager, name, email, /* unused */ position, color) {
  this.emails = [];
  this.color = color || freshColor(email);

  this._manager = manager;
  this._name = name; // Initially, the displayed name. Might be enhanced later.
  this._email = email; // The original email. Use to pick a gravatar.
  this._profiles = {};
  this._card = null;
  this._useCardName = false;

  this.fetch();
}

ContactFromAB.prototype = {
  fetch: function _ContactFromAB_fetch() {
    let card = GlodaUtils.getCardForEmail(this._email);
    this._card = card;
    if (card) {
      // getProperty may return "0" or "1" which must be "== false"'d to be
      //  properly evaluated
      this._useCardName = !!card.getProperty("PreferDisplayName", true);
      this.emails = [card.primaryEmail, card.getProperty("SecondEmail", "")];
      // Prefer:
      // - displayName
      // - firstName lastName (if one of these is non-empty)
      // - the parsed name
      // - the email
      if (this._useCardName && card.displayName)
        this._name = card.displayName;
      if (this._useCardName && (card.firstName || card.lastName))
        this._name = card.firstName + " " + card.lastName;
      if (!this._name)
        this._name = this._email;
    } else {
      this.emails = [this._email];
      this._name = this._name || this._email;
    }
  },

  get avatar() {
    if (this._card) {
      let photoURI = this._card.getProperty("PhotoURI", "");
      if (photoURI)
        return photoURI;
    }
    return defaultPhotoURI;
  },
};

MixIn(ContactFromAB, ContactMixIn);
MixIn(ContactFromAB, EventHelperMixIn);
