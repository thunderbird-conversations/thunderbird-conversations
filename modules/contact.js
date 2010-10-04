var EXPORTED_SYMBOLS = ['ContactManager', 'Contacts']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);
const msgAccountManager = Cc["@mozilla.org/messenger/account-manager;1"]
                             .getService(Ci.nsIMsgAccountManager);

Cu.import("resource:///modules/iteratorUtils.jsm"); // for fixIterator
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm"); // for getMail3Pane
Cu.import("resource://conversations/log.js");

const Contacts = {
  kFrom: 0,
  kTo: 1
}

let Log = setupLogging("Conversations.Contact");

let gHasPeople;
try {
  Cu.import("resource://people/modules/people.js");
  Log.debug("You have contacts, attaboy!");
  gHasPeople = true;
} catch (e) {
  gHasPeople = false;
  Log.debug("You don't have contacts, bad boy!");
}

let gIdentities = {};
function fillIdentities () {
  for each (let id in fixIterator(msgAccountManager.allIdentities, Ci.nsIMsgIdentity)) {
    // id.fullName
    gIdentities[id.email] = true;
  }
}
fillIdentities();

function ContactManager() {
  this._cache = {};
  this._count = 0;
}

ContactManager.prototype = {
  getContactFromNameAndEmail: function _ContactManager_getContactFromEmail(name, email, position) {
    let self = this;
    let cache = function _cache (contact) {
      for each (let [, email] in Iterator(contact.emails)) {
        self._cache[email] = contact;
      }
    };
    if (email in this._cache) {
      return this._cache[email];
    } else if (gHasPeople) {
      let contact = new ContactFromPeople(this, name, email, position);
      cache(contact);
      return contact;
    } else {
      let contact = new ContactFromAB(this, name, email, position);
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
  toHtmlString: function _ContactMixIn_toInlineHtml (aUseColor, aPosition) {
    let name = this.getName(aPosition);
    let tooltipName = (name != this._email) ? name : "";
    // Parameter aUseColor is optional, and undefined means true
    let colorStyle = (aUseColor === false)
      ? ""
      : ("color :" + this.color)
    ;
    let self = this;
    let replace = function _replace (svc, url) {
      if (svc in self._profiles) {
        let r = [
          "<a href=\"", url.replace("#1", self._profiles[svc]), "\">",
            "<img src=\"chrome://conversations/content/i/", svc, ".ico\" />",
          "</a>"
        ];
        return r.join("");
      } else {
        return "";
      }
    };
    let r = [
      "<span class=\"tooltipWrapper\">",
      "<span style=\"", colorStyle, "\">",
           escapeHtml(String.trim(name)),
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
      "    <div class=\"authorInfo authorLinks\">",
            replace("facebook", "http://www.facebook.com/profile.php?id=#1"),
            //replace("google", "http://www.google.com/profiles/#1"),
            replace("twitter", "http://www.twitter.com/#1"),
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
    /* Register the "send message" link */
    let uri = "mailto:" + this._email;
    let aURI = ioService.newURI(uri, null, null);
    aDomNode.getElementsByClassName("sendEmail")[0].addEventListener(
      "click", function (event) {
        msgComposeService.OpenComposeWindowWithURI(null, aURI);
        event.stopPropagation();
      }, false);

    let mainWindow = getMail3Pane();
    /* The links to various profiles */
    for each (let [, a] in Iterator(aDomNode.getElementsByTagName("a"))) {
      a.addEventListener("click",
        function _link_listener (event)
          mainWindow.specialTabs.siteClickHandler(event, /^mailto:/),
        true);
    }
  },

  getName: function _ContactMixIn_getName (aPosition) {
    Log.assert(aPosition === Contacts.kFrom || aPosition === Contacts.kTo,
      "Someone did not set the 'position' properly");
    // This will be changed later when we localize
    if (this._email in gIdentities)
      return (aPosition === Contacts.kFrom) ? "Me" : "Me";
    else
      return this._name || this._email;
  },
};

function ContactFromAB(manager, name, email) {
  this.emails = [];
  this.color = manager.freshColor();

  this._manager = manager;
  this._name = name; // Initially, the displayed name. Might be enhanced later.
  this._email = email; // The original email. Use to pick a gravatar.
  this._profiles = {};

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
      this._name = card.displayName
        || ((card.firstName || card.lastName)
        ? (card.firstName + " " + card.lastName)
        : this._name || this._email);
    } else {
      this.emails = [this._email];
      this._name = this._name || this._email;
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

function ContactFromPeople(manager, name, email) {
  this.emails = [email];
  this.color = manager.freshColor();

  this._manager = manager;
  this._name = name;
  this._email = email;
  this.avatar = "http://www.gravatar.com/avatar/"
      + GlodaUtils.md5HashString(this._email.trim().toLowerCase())
      + "?r=pg&d=wavatar&s=80";
  this._profiles = {};

  this.fetch();
}

ContactFromPeople.prototype = {
  fetch: function _ContactFromPeople_fetch() {
    let self = this;
    People.find({ emails: this._email }).forEach(function (person) {
      Log.debug("Found a match in contacts");

      let photos = person.getProperty("photos");
      let gravatarPhotos = [photo
        for each (photo in photos)
        if (photo.value.indexOf("www.gravatar.com") >= 0)
      ];
      let profilePhotos = [photo
        for each (photo in photos)
        if (photo.type == "profile")
      ];
      let thumbnailPhotos = [photo
        for each (photo in photos)
        if (photo.type == "thumbnail")
      ];
      if (gravatarPhotos.length)
        self.avatar = gravatarPhotos[0].value;
      else if (profilePhotos.length)
        self.avatar = profilePhotos[0].value;
      else if (thumbnailPhotos.length)
        self.avatar = thumbnailPhotos[0].value;

      /* Will set this._profiles = {
       *  facebook: id,
       *  google: the email,
       *  linkedin: the email,
       *  twitter: the nickname
       * }
       * */
      for each (let [svcName, svc] in Iterator(person.obj.documents)) {
        self._profiles[svcName] = [k for (k in svc)];
      }

      self._name = person.displayName;
      self.emails = self.emails.concat(person.getProperty("emails"));
    });
  },
}

MixIn(ContactFromPeople, ContactMixIn);
