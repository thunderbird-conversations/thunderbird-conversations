var EXPORTED_SYMBOLS = ['ContactManager']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);

Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource://conversations/VariousUtils.jsm");

let gHasPeople;
try {
  Cu.import("resource://people/modules/people.js");
  gHasPeople = true;
} catch (e) {
  gHasPeople = false;
}

gHasPeople = false; // XXX remove this when we do contacts for real

function ContactManager() {
  this._cache = {};
  this._count = 0;
}

ContactManager.prototype = {
  getContactFromNameAndEmail: function _ContactManager_getContactFromEmail(name, email) {
    let self = this;
    let cache = function _cache (contact) {
      for each (let [, email] in Iterator(contact.emails)) {
        self._cache[email] = contact;
      }
    };
    if (email in this._cache) {
      return this._cache[email];
    } else if (gHasPeople) {
      let contact = new ContactFromPeople(this, name, email);
      cache(contact);
      return contact;
    } else {
      let contact = new ContactFromAB(this, name, email);
      cache(contact);
      return contact;
    }
  },

  freshColor: function _ContactManager_freshColor() {
    let predefinedColors = [ "#ED6666", "#ED8866", "#CCC15E", "#9EC269",
      "#69C2AC", "#66B7ED", "#668CED", "#8866ED", "#CB66ED", "#ED66D9"];
    if (this._count < predefinedColors.length) {
      return predefinedColors[this._count++];
    } else {
      let r, g, b;
      // Avoid colors that are too light or too dark.
      do {
        r = Math.random();
        g = Math.random();
        b = Math.random();
      } while (Math.sqrt(r*r + b*b + g*g) > .8 || Math.sqrt(r*r + b*b + g*g) < .2)
      return "rgb("+parseInt(r*255)+","+parseInt(g*255)+","+parseInt(b*255)+")";
    }
  },
}

let ContactMixIn = {
  toHtmlString: function _ContactMixIn_toInlineHtml (aUseColor) {
    let tooltipName = (this.name != this._email)
      ? this.name
      : ""
    ;
    // Parameter aUseColor is optional, and undefined means true
    let colorStyle = (aUseColor === false)
      ? ""
      : ("color :" + this.color)
    ;
    let r = [
      "<span class=\"tooltipWrapper\">",
      "<span style=\"", colorStyle, "\">",
           escapeHtml(String.trim(this.name)),
      "</span>",
      "<div class=\"tooltip\">",
      "    <div class=\"arrow\"></div>",
      "    <div class=\"arrow inside\"></div>",
      "    <div class=\"authorInfo\">",
      "      <span class=\"name\">", tooltipName, "</span>",
      "      <span class=\"authorEmail\">", this._email, "</span>",
      "    </div>",
      "    <div class=\"authorPicture\">",
      "      <img src=\"", this.avatar, "\">",
      "    </div>",
      "    <div class=\"tipFooter\">",
      "      <button class=\"sendEmail\">send email</button>",
      "      <button>more</button>",
      "    </div>",
      "</div>",
      "</span>",
    ].join("");
    return r;
  },

  onAddedToDom: function _ContactMixIn_onAddedToDom(aDomNode) {
    let uri = "mailto:" + this._email;
    aURI = ioService.newURI(uri, null, null);
    aDomNode.getElementsByClassName("sendEmail")[0].addEventListener(
      "click", function (event) {
        msgComposeService.OpenComposeWindowWithURI(null, aURI);
        event.stopPropagation();
      }, false);
  },
};

function ContactFromAB(manager, name, email) {
  this.name = "";
  this.emails = [];
  this.color = manager.freshColor();

  this._manager = manager;
  this._name = name;
  this._email = email; // The original email. Use to pick a gravatar.

  this.fetch();
}

ContactFromAB.prototype = {
  fetch: function _ContactFromAB_fetch() {
    let card = GlodaUtils.getCardForEmail(this._email);
    if (card) {
      this.emails = [card.primaryEmail, card.getProperty("SecondEmail", "")];
      // Prefer:
      // - displayName
      // - firstName lastName (if one of these is non-empty)
      // - the parsed name
      // - the email
      this.name = card.displayName
        || ((card.firstName || card.lastName)
        ? (card.firstName + " " + card.lastName)
        : this._name || this._email);
    } else {
      this.emails = [this._email];
      this.name = this._name || this._email;
    }
  },

  get avatar () {
    let gravatarUrl = "http://www.gravatar.com/avatar/"
      + GlodaUtils.md5HashString(this._email.trim().toLowerCase())
      + "?r=pg&d=wavatar&s=80";
    return gravatarUrl;
  },
}

MixIn(ContactFromAB, ContactMixIn);

function ContactFromPeople(name, email) {
  this.emails = [];
}

ContactFromPeople.prototype = {
}

MixIn(ContactFromPeople, ContactMixIn);
