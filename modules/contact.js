var EXPORTED_SYMBOLS = ['ContactManager', 'Contacts']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);
const clipboardService = Cc["@mozilla.org/widget/clipboardhelper;1"]
                         .getService(Ci.nsIClipboardHelper);

Cu.import("resource:///modules/iteratorUtils.jsm"); // for fixIterator
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource:///modules/gloda/gloda.js");

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

function ContactManager() {
  this._cache = {};
  this._count = 0;
}

ContactManager.prototype = {
  getContactFromNameAndEmail: function _ContactManager_getContactFromEmail(name, email, position) {
    email = (email+"").toLowerCase();
    let self = this;
    let cache = function _cache (contact) {
      for each (let [, email] in Iterator(contact.emails)) {
        email = (email+"").toLowerCase();
        self._cache[email] = contact;
      }
    };
    if (email in this._cache) {
      if (name)
        this._cache[email].enrichWithName(name);
      return this._cache[email];
    } else if (gHasPeople && email.length) {
      let contact = new ContactFromPeople(this, name, email, position);
      cache(contact);
      return contact;
    } else {
      let contact = new ContactFromAB(this, name, email, position);
      cache(contact);
      return contact;
    }
  },

  freshColor: function _ContactManager_freshColor(aIsMe) {
    if (aIsMe) {
      return "#ed6666";
    } else {
      let predefinedColors = ["#ed8866", "#ccc15e", "#9ec269",
        "#69c2ac", "#66b7ed", "#668ced", "#8866ed", "#cb66ed", "#ed66d9"];
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
    }
  },
}

let ContactMixIn = {
  toTmplData: function _ContactMixIn_toInlineHtml (aUseColor, aPosition) {
    let name = this.getName(aPosition);
    let data = {
      name: name,
      tooltipName: (name != this._email) ? name : "",
      email: this._email,
      avatar: this.avatar,
      profiles: this._profiles,
      // Parameter aUseColor is optional, and undefined means true
      colorStyle: ((aUseColor === false)
        ? ""
        : ("color :" + this.color)),
    };
    return data;
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

    let self = this;
    let mainWindow = getMail3Pane();
    // XXX we already did this if we're running without contacts
    // Please note that cardAndBook is never overridden, so that the closure for
    //  the editContact event listener actually sees the updated fields of the
    //  object once the addContact event listener has updated them.
    let cardAndBook = mainWindow.getCardForEmail(self._email);
    if (cardAndBook.card)
      aDomNode.parentNode.classList.add("inAddressBook");
    aDomNode.getElementsByClassName("addContact")[0].addEventListener(
      "click", function (event) {
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
      }, false);
    aDomNode.getElementsByClassName("editContact")[0].addEventListener(
      "click", function (event) {
        let args = {
          abURI: cardAndBook.book.URI,
          card: cardAndBook.card,
        };
        mainWindow.openDialog(
          "chrome://messenger/content/addressbook/abEditCardDialog.xul",
          "", "chrome,modal,resizable=no,centerscreen", args
        );
      }, false);
    aDomNode.getElementsByClassName("copyEmail")[0].addEventListener(
      "click", function (event) {
        clipboardService.copyString(self._email);
      }, false);
    aDomNode.getElementsByClassName("showInvolving")[0].addEventListener(
      "click", function (event) {
        let q1 = Gloda.newQuery(Gloda.NOUN_IDENTITY);
        q1.kind("email");
        q1.value(self._email);
        q1.getCollection({
          onItemsAdded: function _onItemsAdded(aItems, aCollection) {  },
          onItemsModified: function _onItemsModified(aItems, aCollection) { },
          onItemsRemoved: function _onItemsRemoved(aItems, aCollection) { },
          onQueryCompleted: function _onQueryCompleted(aCollection) {
            if (!aCollection.items.length)
              return;  

            let q2 = Gloda.newQuery(Gloda.NOUN_MESSAGE);
            q2.involves.apply(q2, aCollection.items);
            q2.getCollection({
              onItemsAdded: function _onItemsAdded(aItems, aCollection) {  },
              onItemsModified: function _onItemsModified(aItems, aCollection) {  },
              onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {  },
              onQueryCompleted: function _onQueryCompleted(aCollection) {  
                let tabmail = mainWindow.document.getElementById("tabmail");
                /*aCollection.items =
                  [GCV.selectRightMessage(m)
                  for each ([, m] in Iterator(GCV.groupMessages(aCollection.items)))];
                aCollection.items = aCollection.items.filter(function (x) x);*/
                tabmail.openTab("glodaList", {
                  collection: aCollection,
                  title: "Messages involving #1".replace("#1", self._name),
                  background: false
                });
              }
            });
          }
        });
      }, false);

    /* The links to various profiles */
    for each (let [, a] in Iterator(aDomNode.getElementsByTagName("a"))) {
      let (a = a) { // I hate you Javascript! I hate you!!!
        a.addEventListener("click",
          a.classList.contains("profile-link")
          ? function _link_listener (event) (
              mainWindow.document.getElementById("tabmail").openTab("contentTab", {
                contentPage: a.href, // ^^ (cf. supra)
                clickHandler: "specialTabs.defaultClickHandler(event);"
              }),
              event.preventDefault()
            )
          : function _link_listener (event) (
              mainWindow.specialTabs.siteClickHandler(event, /^mailto:/),
              event.preventDefault()
            ),
          false);
      }
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

  enrichWithName: function _ContactMixIn_enrichWithName (aName) {
    if (this._name == this._email || !this._name)
      this._name = aName;
  },
};

function ContactFromAB(manager, name, email) {
  this.emails = [];
  this.color = manager.freshColor(email in gIdentities);

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
  this.color = manager.freshColor(email in gIdentities);

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

      // Find out about the guy's profiles... This will set self._profiles = {
      //  twitter: twitter username,
      //  facebook: facebook id,
      //  google: google profile URL,
      //  flickr: flickr photo page URL,
      // }
      // Log.debug(JSON.stringify(person.obj));
      let docs = person.obj.documents;
      if ("facebook" in docs)
        self._profiles["facebook"] = Object.keys(docs.facebook)[0];
      if ("twitter" in docs)
        self._profiles["twitter"] = Object.keys(docs.twitter)[0];
      for each (let [svcName, svc] in Iterator(person.obj.documents)) {
        if (svcName.indexOf("hcard:http://www.google.com/profiles/") === 0
            && (!("google" in self._profiles))) {
          self._profiles["google"] = svcName.substring("hcard:".length, svcName.length);
        }
        if (svcName.indexOf("hcard:http://www.flickr.com/photos/") === 0
            && (!("flickr" in self._profiles))) {
          self._profiles["flickr"] = svcName.substring("hcard:".length, svcName.length);
        }
      }

      self._name = person.displayName;
      self.emails = self.emails.concat(person.getProperty("emails"));
    });
  },
}

MixIn(ContactFromPeople, ContactMixIn);
