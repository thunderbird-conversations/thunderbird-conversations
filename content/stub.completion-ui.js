"use strict";

// ----- Autocomplete stuff. Understand it as a part of stub.compose-ui.js

Cu.import("resource:///modules/errUtils.js");
Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource:///modules/gloda/suffixtree.js");
Cu.import("resource:///modules/gloda/noun_tag.js");
Cu.import("resource:///modules/gloda/noun_freetag.js");

try {
  Cu.import("resource://people/modules/people.js");
} catch (e) {
  Log.debug("You don't have Contacts installed. Gloda will provide autocomplete.");
}

let Log = setupLogging("Conversations.Stub.Completion");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

// Wrap the given parameters in an object that's compatible with the
//  facebook-style autocomplete.
function asToken(thumb, name, email, guid) {
  let hasName = name && (String.trim(name).length > 0);
  let data = hasName ? MailServices.headerParser.makeFullAddress(name, email) : email;
  let nameStr = hasName ? name + " <" + email + ">" : email;
  let thumbStr = thumb ? "<img class='autocomplete-thumb' src=\""+escapeHtml(thumb)+"\" /> " : "";
  let listItem = thumbStr + escapeHtml(nameStr); // this one is for injection
  let id = guid;
  let displayName = hasName ? name : email;
  return { name: displayName, listItem: listItem, data: data, email: email, id: guid }
}

const MAX_POPULAR_CONTACTS = 200;
const MAX_RESULTS = 10;

/**
 * Complete contacts/identities based on name/email.  Instant phase is based on
 *  a suffix-tree built of popular contacts/identities.  Delayed phase relies
 *  on a LIKE search of all known contacts.
 */
function ContactIdentityCompleter() {
  // get all the contacts
  let contactQuery = Gloda.newQuery(Gloda.NOUN_CONTACT);
  contactQuery.orderBy("-popularity").limit(MAX_POPULAR_CONTACTS);
  this.contactCollection = contactQuery.getCollection(this, null);
  this.contactCollection.becomeExplicit();
}

ContactIdentityCompleter.prototype = {
  _popularitySorter: function(a, b){ return b.popularity - a.popularity; },
  complete: function ContactIdentityCompleter_complete(aResult, aString) {
    if (aString.length < 3) {
      // In CJK, first name or last name is sometime used as 1 character only.
      // So we allow autocompleted search even if 1 character.
      //
      // [U+3041 - U+9FFF ... Full-width Katakana, Hiragana
      //                      and CJK Ideograph
      // [U+AC00 - U+D7FF ... Hangul
      // [U+F900 - U+FFDC ... CJK compatibility ideograph
      if (!aString.match(/[\u3041-\u9fff\uac00-\ud7ff\uf900-\uffdc]/))
        return false;
    }

    let matches;
    if (this.suffixTree) {
      matches = this.suffixTree.findMatches(aString.toLowerCase());
    }
    else
      matches = [];

    // let's filter out duplicates due to identity/contact double-hits by
    //  establishing a map based on the contact id for these guys.
    // let's also favor identities as we do it, because that gets us the
    //  most accurate gravat, potentially
    let contactToThing = {};
    for (let iMatch = 0; iMatch < matches.length; iMatch++) {
      let thing = matches[iMatch];
      if (thing.NOUN_ID == Gloda.NOUN_CONTACT && !(thing.id in contactToThing))
        contactToThing[thing.id] = thing;
      else if (thing.NOUN_ID == Gloda.NOUN_IDENTITY)
        contactToThing[thing.contactID] = thing;
    }
    // and since we can now map from contacts down to identities, map contacts
    //  to the first identity for them that we find...
    matches = [val.NOUN_ID == Gloda.NOUN_IDENTITY ? val : val.identities[0]
               for each ([iVal, val] in Iterator(contactToThing))];

    let rows = [asToken(
                  match.pictureURL(),
                  match.contact.name != match.value ? match.contact.name : null,
                  match.value,
                  match.value
                ) for each ([iMatch, match] in Iterator(matches))];
    aResult.addRows(rows);

    // - match against database contacts / identities
    let pending = {contactToThing: contactToThing, pendingCount: 2};

    let contactQuery = Gloda.newQuery(Gloda.NOUN_CONTACT);
    contactQuery.nameLike(contactQuery.WILDCARD, aString,
        contactQuery.WILDCARD);
    pending.contactColl = contactQuery.getCollection(this, aResult);
    pending.contactColl.becomeExplicit();

    let identityQuery = Gloda.newQuery(Gloda.NOUN_IDENTITY);
    identityQuery.kind("email").valueLike(identityQuery.WILDCARD, aString,
        identityQuery.WILDCARD);
    pending.identityColl = identityQuery.getCollection(this, aResult);
    pending.identityColl.becomeExplicit();

    aResult._contactCompleterPending = pending;

    return true;
  },
  onItemsAdded: function(aItems, aCollection) {
  },
  onItemsModified: function(aItems, aCollection) {
  },
  onItemsRemoved: function(aItems, aCollection) {
  },
  onQueryCompleted: function(aCollection) {
    // handle the initial setup case...
    if (aCollection.data == null) {
      // cheat and explicitly add our own contact...
      if (!(Gloda.myContact.id in this.contactCollection._idMap))
        this.contactCollection._onItemsAdded([Gloda.myContact]);

      // the set of identities owned by the contacts is automatically loaded as part
      //  of the contact loading...
      // (but only if we actually have any contacts)
      this.identityCollection =
        this.contactCollection.subCollections[Gloda.NOUN_IDENTITY];

      let contactNames = [(c.name.replace(" ", "").toLowerCase() || "x") for each
                          ([, c] in Iterator(this.contactCollection.items))];
      // if we had no contacts, we will have no identity collection!
      let identityMails;
      if (this.identityCollection)
        identityMails = [i.value.toLowerCase() for each
                         ([, i] in Iterator(this.identityCollection.items))];

      // The suffix tree takes two parallel lists; the first contains strings
      //  while the second contains objects that correspond to those strings.
      // In the degenerate case where identityCollection does not exist, it will
      //  be undefined.  Calling concat with an argument of undefined simply
      //  duplicates the list we called concat on, and is thus harmless.  Our
      //  use of && on identityCollection allows its undefined value to be
      //  passed through to concat.  identityMails will likewise be undefined.
      this.suffixTree = new MultiSuffixTree(contactNames.concat(identityMails),
        this.contactCollection.items.concat(this.identityCollection &&
          this.identityCollection.items));

      return;
    }

    // handle the completion case
    let result = aCollection.data;
    let pending = result._contactCompleterPending;

    if (--pending.pendingCount == 0) {
      let possibleDudes = [];

      let contactToThing = pending.contactToThing;

      let items;

      // check identities first because they are better than contacts in terms
      //  of display
      items = pending.identityColl.items;
      for (let iIdentity = 0; iIdentity < items.length; iIdentity++){
        let identity = items[iIdentity];
        if (!(identity.contactID in contactToThing)) {
          contactToThing[identity.contactID] = identity;
          possibleDudes.push(identity);
          // augment the identity with its contact's popularity
          identity.popularity = identity.contact.popularity;
        }
      }
      items = pending.contactColl.items;
      for (let iContact = 0; iContact < items.length; iContact++) {
        let contact = items[iContact];
        if (!(contact.id in contactToThing)) {
          contactToThing[contact.id] = contact;
          if (contact.identities)
            possibleDudes.push(contact.identities[0]);
        }
      }

      // sort in order of descending popularity
      possibleDudes.sort(this._popularitySorter);
      let rows = [asToken(
                    dude.pictureURL(),
                    dude.contact.name != dude.value ? dude.contact.name : null,
                    dude.value,
                    dude.value
                  ) for each ([iDude, dude] in Iterator(possibleDudes))];
      result.addRows(rows);
      result.markCompleted(this);

      // the collections no longer care about the result, make it clear.
      delete pending.identityColl.data;
      delete pending.contactColl.data;
      // the result object no longer needs us or our data
      delete result._contactCompleterPending;
    }
  }
};

function glodaAutocomplete(query, callback) {
  let results = [];
  let completer = new ContactIdentityCompleter();
  completer.complete({
    addRows: function (matches) {
      results = results.concat(matches);
    },
    markCompleted: function () {
      if (!results.length)
        callback([asToken(null, null, query, query)]);
      else
        callback(results.slice(0, MAX_RESULTS));
    },
  }, query);
}

function peopleAutocomplete(query, callback) {
  let results = [];
  let dupCheck = {};
  let add = function(person) {
    let photos = person.getProperty("photos");
    let thumb;
    for each (let photo in photos) {
      if (photo.type == "thumbnail") {
        thumb = photo.value;
        break;
      }
    }

    let suggestions = person.getProperty("emails");
    for each (let suggestion in suggestions)
    {
      if (suggestion.value in dupCheck)
        continue;
      dupCheck[suggestion.value] = null;
      results.push(asToken(thumb, person.displayName, suggestion.value, person.guid));
    }
  };
  try {
    // Contacts doesn't seem to allow a OR, so run two queries... (longer)
    People.find({ displayName: query }).forEach(add);
    People.find({ emails: query }).forEach(add);
  } catch(e) {
    Log.error(e);
    dumpCallStack(e);
  }
  if (!results.length)
    results.push(asToken(null, null, query, query));
  callback(results);
}

let autoCompleteClasses = {
  tokenList: "token-input-list-facebook",
  token: "token-input-token-facebook",
  tokenDelete: "token-input-delete-token-facebook",
  selectedToken: "token-input-selected-token-facebook",
  highlightedToken: "token-input-highlighted-token-facebook",
  dropdown: "token-input-dropdown-facebook",
  dropdownItem: "token-input-dropdown-item-facebook",
  dropdownItem2: "token-input-dropdown-item2-facebook",
  selectedDropdownItem: "token-input-selected-dropdown-item-facebook",
  inputToken: "token-input-input-token-facebook"
}

function setupAutocomplete(to, cc, bcc) {
  // This function assumes aInput is #something
  let fill = function (aInput, aList, aData) {
    // Cleanup the mess left by tokenInput.
    let $parent = $(aInput).parent();
    $parent.empty();
    $parent.append($("<input type=\"text\" id=\""+aInput.substring(1)+"\" />"));
    // Now we can start fresh.
    let f = ("People" in window)
      ? peopleAutocomplete
      : glodaAutocomplete
    ;
    $(aInput).tokenInput(f, {
      classes: autoCompleteClasses,
      prePopulate: aData,
    });
    $(aList+" li:not(.add-more)").remove();
    $(aList+" .recipientListSeparator").remove();
    let list = document.getElementsByClassName(aList.substring(1))[0];
    let marker = list.getElementsByClassName("add-more")[0];
    // Never, ever use jquery in a loop.
    for each (let [i, { name, email }] in Iterator(aData)) {
      if (!email)
        continue;
      let sep;
      if (aData.length <= 1)
        sep = "";
      else if (i == aData.length - 2)
        sep = strings.get("sepAnd");
      else if (i == aData.length - 1)
        sep = "";
      else
        sep = strings.get("sepComma");
      let li = document.createElement("li");
      li.setAttribute("title", email);
      li.textContent = name;
      let span = document.createElement("span");
      span.classList.add("recipientListSeparator");
      span.textContent = sep;
      list.insertBefore(li, marker);
      list.insertBefore(span, marker);
    }
  };
  fill("#to", ".toList", to);
  fill("#cc", ".ccList", cc);
  fill("#bcc", ".bccList", bcc);

  if (cc.length)
    showCc();
  if (bcc.length)
    showBcc();
}
