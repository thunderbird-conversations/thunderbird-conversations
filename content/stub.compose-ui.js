const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource:///modules/errUtils.js");
Cu.import("resource:///modules/gloda/gloda.js");
Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/gloda/utils.js");
Cu.import("resource:///modules/gloda/mimemsg.js");
Cu.import("resource:///modules/gloda/suffixtree.js");
Cu.import("resource:///modules/gloda/noun_tag.js");
Cu.import("resource:///modules/gloda/noun_freetag.js");

const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);

Cu.import("resource://conversations/AddressBookUtils.jsm");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/send.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Stub.Compose");
try {
  Cu.import("resource://people/modules/people.js");
} catch (e) {
  Log.debug("You don't have Contacts installed. Can't autocomplete.");
}

let gComposeParams = {
  msgHdr: null,
  identity: null,
  to: null,
  cc: null,
  bcc: null,
  subject: null,
};

// bug 495747 #c10
let url = "http://www.xulforum.org";
let ios = Components.classes["@mozilla.org/network/io-service;1"]
  .getService(Components.interfaces.nsIIOService);
let ssm = Components.classes["@mozilla.org/scriptsecuritymanager;1"]
  .getService(Components.interfaces.nsIScriptSecurityManager);
let dsm = Components.classes["@mozilla.org/dom/storagemanager;1"]
  .getService(Components.interfaces.nsIDOMStorageManager);
let uri = ios.newURI(url, "", null);
let principal = ssm.getCodebasePrincipal(uri);
let storage = dsm.getLocalStorageForPrincipal(principal, "");

// ----- Event listeners

// Called when we need to expand the textarea and start editing a new message
function onTextareaClicked(event) {
  // Do it just once
  if (!$(event.target).parent().hasClass('expand')) {
    $(event.target).parent().addClass('expand');
  }
  if (!gComposeParams.msgHdr) { // first time
    Log.debug("Setting up the initial quick reply compose parameters...");
    let messages = Conversations.currentConversation.messages;
    try {
      setupReplyForMsgHdr(messages[messages.length - 1].message._msgHdr);
    } catch (e) {
      Log.debug(e);
      dumpCallStack(e);
    }
    scrollNodeIntoView(document.querySelector(".quickReply"));
  }
}

function showCc(event) {
  $(".ccList, .editCcList").css("display", "");
  $(".showCc").hide();
}


function showBcc(event) {
  $(".bccList, .editBccList").css("display", "");
  $(".showBcc").hide();
}

function editFields(aFocusId) {
  $('.quickReplyRecipients').addClass('edit');
  $("#"+aFocusId).next().find(".token-input-input-token-facebook input").last().focus();
}

function onDiscard(event) {
  $("textarea").val("");
  onSave(event);
}

function onSave(event) {
  let id = Conversations.currentConversation.id; // Gloda ID
  if (id) {
    storage.setItem("conversation"+id, $("textarea").val());
  }
  $(".quickReply").removeClass('expand');
}

function loadDraft() {
  let id = Conversations.currentConversation.id; // Gloda ID
  if (id) {
    $("textarea").val(storage.getItem("conversation"+id));
    $("#discard, #save").attr("disabled", "");
  } else {
    $("#discard, #save").attr("disabled", "disabled");
  }
}

function onNewThreadClicked() {
  if ($("#startNewThread:checked").length) {
    $(".editSubject").css("display", "-moz-box");
  } else {
    $(".editSubject").css("display", "none");
  }
}

function useEditor() {
  if (onSend(null, true))
    onDiscard();
}

function onSend(event, aPopOut) {
  let textarea = document.getElementsByTagName("textarea")[0];
  let msg = "Send an empty message?";
  if (!aPopOut && !$(textarea).val().length && !confirm(msg))
    return;

  let isNewThread = $("#startNewThread:checked").length;
  return sendMessage({
      msgHdr: gComposeParams.msgHdr,
      identity: gComposeParams.identity,
      to: $("#to").val(),
      cc: $("#cc").val(),
      bcc: $("#bcc").val(),
      subject: isNewThread ? $("#subject").val() : gComposeParams.subject,
    }, {
      compType: isNewThread ? Ci.nsIMsgCompType.New : Ci.nsIMsgCompType.ReplyAll,
      deliverType: Ci.nsIMsgCompDeliverMode.Now,
    }, textarea, {
      progressListener: progressListener,
      sendListener: sendListener,
      stateListener: stateListener,
    }, aPopOut
  );
}

function transferQuickReplyToNewWindow(aWindow, aExpand) {
  // The handler from stub.html called onSave before, and since saving/loading
  //  is synchronous, it works. When we make saving/loading asynchronous, we'll
  //  probably have to come up with something else.
  aWindow.loadDraft();
  // ^^ We have to load the draft anyways since the draft is not necessarily
  //  from this very editing session, it might be a leftover draft from before,
  //  so in any case it should be restored.
  if (!gComposeParams.msgHdr) {
    Log.debug("No quick reply session to transfer to the new tab");
    return;
  }
  try {
    Log.debug("Transferring our quick reply session over to the new tab...");
    // Now we've forwarded the contents. The two lines below setup from, to, cc,
    //  bcc properly.
    let [toNames, toEmails] = parse($("#to").val());
    let [ccNames, ccEmails] = parse($("#cc").val());
    let [bccNames, bccEmails] = parse($("#bcc").val());
    aWindow.gComposeParams = {
      msgHdr: gComposeParams.msgHdr,
      identity: gComposeParams.identity,
      to: [asToken(null, toName, toEmails[i], null)
        for each ([i, toName] in Iterator(toNames))],
      cc: [asToken(null, ccName, ccEmails[i], null)
        for each ([i, ccName] in Iterator(ccNames))],
      bcc: [asToken(null, bccName, bccEmails[i], null)
        for each ([i, bccName] in Iterator(bccNames))],
      subject: gComposeParams.subject,
    };
    aWindow.updateUI();
    // Special code for the subject.
    let isNewThread = $("#startNewThread:checked").length;
    if (isNewThread) {
      aWindow.$("#startNewThread")[0].checked = true;
      aWindow.onNewThreadClicked();
      aWindow.$("#subject").val($("#subject").val());
    }
    // Open if already opened
    if (aExpand)
      aWindow.$("textarea").parent().addClass('expand');
    // That should be pretty much all.
  } catch (e) {
    Log.error(e);
    dumpCallStack(e);
  }
}

// ----- Helpers

// Just get the email and/or name from a MIME-style "John Doe <john@blah.com>"
//  line.
function parse(aMimeLine) {
  let emails = {};
  let fullNames = {};
  let names = {};
  let numAddresses = gHeaderParser.parseHeadersWithArray(aMimeLine, emails, names, fullNames);
  return [names.value, emails.value];
}

// ----- Main logic

// The logic that decides who to compose, from which address, etc. etc.
function setupReplyForMsgHdr(aMsgHdr) {
  // Standard procedure for finding which identity to send with, as per
  // http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js#210
  // XXX something's wrong but I don't know what
  let mainWindow = getMail3Pane();
  let identity = mainWindow.getIdentityForHeader(aMsgHdr, Ci.nsIMsgCompType.ReplyAll)
    || gIdentities.default;
  Log.debug("We picked", identity.email, "for sending");
  // Set the global parameters
  gComposeParams.identity = identity;
  gComposeParams.msgHdr = aMsgHdr;
  gComposeParams.subject = "Re: "+aMsgHdr.mime2DecodedSubject;
  $("#subject").val(gComposeParams.subject);

  // Do the whole shebang to find out who to send to...
  let [author, authorEmailAddress] = parse(aMsgHdr.mime2DecodedAuthor);
  let [recipients, recipientsEmailAddresses] = parse(aMsgHdr.mime2DecodedRecipients);
  let [ccList, ccListEmailAddresses] = parse(aMsgHdr.ccList);
  let [bccList, bccListEmailAddresses] = parse(aMsgHdr.bccList);

  let isReplyToOwnMsg = false;
  for each (let [i, identity] in Iterator(gIdentities)) {
    Log.debug("Iterating over identities", i, identity);
    if (!identity) {
      Log.debug("This identity is null, pretty weird...");
      continue;
    }
    let email = identity.email;
    if (email == authorEmailAddress)
      isReplyToOwnMsg = true;
    if (recipientsEmailAddresses.filter(function (x) x == email).length)
      isReplyToOwnMsg = false;
    if (ccListEmailAddresses.filter(function (x) x == email).length)
      isReplyToOwnMsg = false;
  }

  // Actually we are implementing the "Reply all" logic... that's better, no one
  //  wants to really use reply anyway ;-)
  if (isReplyToOwnMsg) {
    Log.debug("Replying to our own message...");
    gComposeParams.to = [asToken(null, r, recipientsEmailAddresses[i], null)
      for each ([i, r] in Iterator(recipients))];
  } else {
    gComposeParams.to = [asToken(null, author, authorEmailAddress, null)];
  }
  gComposeParams.cc = [asToken(null, cc, ccListEmailAddresses[i], null)
    for each ([i, cc] in Iterator(ccList))
    if (ccListEmailAddresses[i] != identity.email)];
  if (!isReplyToOwnMsg)
    gComposeParams.cc = gComposeParams.cc.concat
      ([asToken(null, r, recipientsEmailAddresses[i], null)
        for each ([i, r] in Iterator(recipients))
        if (recipientsEmailAddresses[i] != identity.email)]);
  gComposeParams.bcc = [asToken(null, bcc, bccListEmailAddresses[i], null)
    for each ([i, bcc] in Iterator(bccList))];

  // We're streaming the message just to get the reply-to header... kind of a
  //  shame...
  try {
    MsgHdrToMimeMessage(aMsgHdr, null, function (aMsgHdr, aMimeMsg) {
      if ("reply-to" in aMimeMsg.headers) {
        let [name, email] = parse(aMimeMsg.headers["reply-to"]);
        if (email) {
          gComposeParams.to = [asToken(null, name, email, null)];
        }
      }
      updateUI();
    }, false); // don't download
  } catch (e if e.result == Cr.NS_ERROR_FAILURE) { // Message not available offline.
    // And update our nice composition UI
    updateUI();
  }
}

// When all the composition parameters have been set, update the UI with them
// (e.g. recipients, sender, etc.)
function updateUI() {
  let i = gComposeParams.identity;
  $(".senderName").text(i.fullName + " <"+i.email+">");
  setupAutocomplete();
}

// ----- Autocomplete stuff

// Wrap the given parameters in an object that's compatible with the
//  facebook-style autocomplete.
function asToken(thumb, name, email, guid) {
  let hasName = name && (String.trim(name).length > 0);
  let data = hasName ? gHeaderParser.makeFullAddress(name, email) : email;
  let thumbStr = thumb ? "<img class='autocomplete-thumb' src=\""+thumb+"\" /> " : "";
  let nameStr = hasName ? name + " &lt;" + email + "&gt;" : email;
  let listItem = thumbStr + nameStr;
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

function setupAutocomplete() {
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
    for each (let [i, { name, email }] in Iterator(aData)) {
      if (!email)
        continue;
      let sep;
      if (aData.length <= 1)
        sep = "";
      else if (i == aData.length - 2)
        sep = "&nbsp;and&nbsp;";
      else if (i == aData.length - 1)
        sep = "";
      else
        sep = ",&nbsp;";
      $(aList+" .add-more").before($("<li title=\""+email+"\">"+name+sep+"</li>"));
    }
  };
  fill("#to", ".toList", gComposeParams.to);
  fill("#cc", ".ccList", gComposeParams.cc);
  fill("#bcc", ".bccList", gComposeParams.bcc);

  if (gComposeParams.cc.length)
    showCc();
  if (gComposeParams.bcc.length)
    showBcc();
}

// ----- Listeners.
//
// These are notified about the outcome of the send process and take the right
//  action accordingly (close window on success, etc. etc.)
//  
// This process is inherently FLAWED because we can't listen for the end of the
//  "save sent message" event which would actually tell us that we're done. From
//  what I understand from
//  http://mxr.mozilla.org/comm-central/source/mailnews/compose/src/nsMsgCompose.cpp#3520,
//  the onStopSending event tells us that we're done if and only if we're not
//  copying the message to the sent folder.
// Otherwise, we need to listen for the OnStopCopy event.
//  http://mxr.mozilla.org/comm-central/source/mailnews/compose/src/nsMsgSend.cpp#4149
//  But this is harcoded and mListener is nsMsgComposeSendListener in
//  nsMsgCompose.cpp (bad!).
// There's a thing called a state listener that might be what we're looking
//  for...

function pValue (v) {
  $(".statusPercentage")
    .show()
    .text(v+"%");
  $(".statusThrobber").hide();
}

function pUndetermined () {
  $(".statusPercentage").hide();
  $(".statusThrobber").show();
}

function pText (t) {
  $(".statusMessage").text(t);
}

// all progress notifications are done through the nsIWebProgressListener implementation...
let progressListener = {
  onStateChange: function (aWebProgress, aRequest, aStateFlags, aStatus) {
    Log.debug("onStateChange", aWebProgress, aRequest, aStateFlags, aStatus);
    if (aStateFlags & Ci.nsIWebProgressListener.STATE_START) {
      pUndetermined();
      $(".quickReplyHeader").show();
    }

    if (aStateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
      pValue(0);
      pText('');
    }
  },

  onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    Log.debug("onProgressChange", aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress);
    // Calculate percentage.
    var percent;
    if (aMaxTotalProgress > 0) {
      percent = Math.round( (aCurTotalProgress*100)/aMaxTotalProgress );
      if (percent > 100)
        percent = 100;

      // Advance progress meter.
      pValue(percent);
    } else {
      // Progress meter should be barber-pole in this case.
      pUndetermined();
    }
  },

  onLocationChange: function(aWebProgress, aRequest, aLocation) {
    // we can ignore this notification
  },

  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    pText(aMessage);
  },

  onSecurityChange: function(aWebProgress, aRequest, state) {
    // we can ignore this notification
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIWebProgressListener,
    Ci.nsISupports
  ]),
};

let sendListener = {
  /**
   * Notify the observer that the message has started to be delivered. This method is
   * called only once, at the beginning of a message send operation.
   *
   * @return The return value is currently ignored.  In the future it may be
   * used to cancel the URL load..
   */
  onStartSending: function (aMsgID, aMsgSize) {
    pText("Sending message...");
    Log.debug("onStartSending", aMsgID, aMsgSize);
  },

  /**
   * Notify the observer that progress as occurred for the message send
   */
  onProgress: function (aMsgID, aProgress, aProgressMax) {
    Log.debug("onProgress", aMsgID, aProgress, aProgressMax);
  },

  /**
   * Notify the observer with a status message for the message send
   */
  onStatus: function (aMsgID, aMsg) {
    Log.debug("onStatus", aMsgID, aMsg);
  },

  /**
   * Notify the observer that the message has been sent.  This method is 
   * called once when the networking library has finished processing the 
   * message.
   * 
   * This method is called regardless of whether the the operation was successful.
   * aMsgID   The message id for the mail message
   * status   Status code for the message send.
   * msg      A text string describing the error.
   * returnFileSpec The returned file spec for save to file operations.
   */
  onStopSending: function (aMsgID, aStatus, aMsg, aReturnFile) {
    // if (aExitCode == NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_SERVER ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_UNKNOWN_REASON ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_REFUSED ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_INTERRUPTED ||
    //     aExitCode == NS_ERROR_SMTP_SEND_FAILED_TIMEOUT ||
    //     aExitCode == NS_ERROR_SMTP_PASSWORD_UNDEFINED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_FAILURE ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_GSSAPI ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_MECH_NOT_SUPPORTED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_NOT_SUPPORTED ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_NO_SSL ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_ENCRYPT_TO_PLAIN_SSL ||
    //     aExitCode == NS_ERROR_SMTP_AUTH_CHANGE_PLAIN_TO_ENCRYPT ||
    //     aExitCode == NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS)
    //
    // Moar in mailnews/compose/src/nsComposeStrings.h
    Log.debug("onStopSending", aMsgID, aStatus, aMsg, aReturnFile);
    // This function is called only when the actual send has been performed,
    //  i.e. is not called when saving a draft (although msgCompose.SendMsg is
    //  called...)
    if (NS_SUCCEEDED(aStatus)) {
      //if (gOldDraftToDelete)
      //  msgHdrsDelete([gOldDraftToDelete]);
      pText("Message "+aMsgID+" sent successfully"); 
    } else {
      Log.debug("NS_FAILED onStopSending");
    }
  },

  /**
   * Notify the observer with the folder uri before the draft is copied.
   */
  onGetDraftFolderURI: function (aFolderURI) {
    Log.debug("onGetDraftFolderURI", aFolderURI);
  },

  /**
   * Notify the observer when the user aborts the send without actually doing the send
   * eg : by closing the compose window without Send.
   */
  onSendNotPerformed: function (aMsgID, aStatus) {
    Log.debug("onSendNotPerformed", aMsgID, aStatus);
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIMsgSendListener,
    Ci.nsISupports
  ]),
}

let copyListener = {
  onStopCopy: function (aStatus) {
    Log.debug("onStopCopy", aStatus);
    if (NS_SUCCEEDED(aStatus)) {
      //if (gOldDraftToDelete)
      //  msgHdrsDelete(gOldDraftToDelete);
    }
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIMsgCopyServiceListener,
    Ci.nsISupports
  ]),
}

let stateListener = {
  NotifyComposeFieldsReady: function() {
    // ComposeFieldsReady();
  },

  NotifyComposeBodyReady: function() {
    // if (gMsgCompose.composeHTML)
    //   loadHTMLMsgPrefs();
    // AdjustFocus();
  },

  ComposeProcessDone: function(aResult) {
    if (NS_SUCCEEDED(aResult)) {
      $(".quickReplyHeader").hide();
      onDiscard();
      // Well we assume the user hasn't changed the quick reply parameters in
      //  the meanwhile... FIXME
      let msgHdr = gComposeParams.msgHdr;
      msgHdr.folder.addMessageDispositionState(msgHdr, Ci.nsIMsgFolder.nsMsgDispositionState_Replied);
      msgHdr.folder.msgDatabase = null;
    }
  },

  SaveInFolderDone: function(folderURI) {
    // DisplaySaveFolderDlg(folderURI);
  }
};
