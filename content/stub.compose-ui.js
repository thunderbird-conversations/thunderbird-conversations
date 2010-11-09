const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/XPCOMUtils.jsm"); // for generateQI

// XXX remove the useless ones when done with the file
const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);
const gMsgTagService = Cc["@mozilla.org/messenger/tagservice;1"]
                       .getService(Ci.nsIMsgTagService);
const ioService = Cc["@mozilla.org/network/io-service;1"]
                  .getService(Ci.nsIIOService);
const msgComposeService = Cc["@mozilla.org/messengercompose;1"]
                          .getService(Ci.nsIMsgComposeService);
const accountManager = Cc["@mozilla.org/messenger/account-manager;1"]
                        .getService(Ci.nsIMsgAccountManager);

// XXX same remark
Cu.import("resource://conversations/AddressBookUtils.jsm");
Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/contact.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Stub.Compose");
try {
  Cu.import("resource://people/modules/people.js");
} catch (e) {
  Log.debug("You don't have Contacts installed. Can't autocomplete.");
}

let gComposeParams = {
  identity: null,
  to: null,
  cc: null,
  bcc: null,
};

// ----- Event listeners

// Called when we need to expand the textarea and start editing a new message
function onTextareaClicked(event) {
  // Do it just once
  if (!$(event.target).parent().hasClass('expand')) {
    $(event.target).parent().addClass('expand');
    let messages = Conversations.currentConversation.messages;
    setupReplyForMsgHdr(messages[messages.length - 1].message._msgHdr);
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

function editFields(event) {
  $('.quickReplyRecipients').addClass('edit');
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
  let folder = aMsgHdr.folder;
  let identity = folder.customIdentity;
  if (!identity)
    identity = getMail3Pane().getIdentityForServer(folder.server);
  // Set the global parameter
  gComposeParams.identity = identity;

  // Do the whole shebang to find out who to send to...
  let [author, authorEmailAddress] = parse(aMsgHdr.mime2DecodedAuthor);
  let [recipients, recipientsEmailAddresses] = parse(aMsgHdr.mime2DecodedRecipients);
  let [ccList, ccListEmailAddresses] = parse(aMsgHdr.ccList);
  let [bccList, bccListEmailAddresses] = parse(aMsgHdr.bccList);

  let isReplyToOwnMsg = false;
  for each (let [i, identity] in Iterator(gIdentities)) {
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

  // And update our nice composition UI
  updateUI();
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
  let data = hasName ? name + " <" + email + ">" : email;
  let thumbStr = thumb ? "<img class='autocomplete-thumb' src=\""+thumb+"\" /> " : "";
  let nameStr = hasName ? name + " &lt;" + email + "&gt;" : email;
  let listItem = thumbStr + nameStr;
  let id = guid;
  let displayName = hasName ? name : email;
  return { name: displayName, listItem: listItem, data: data, id: guid }
}

function peopleAutocomplete(query, callback) {
  if (!("People" in window)) {
    callback([asToken(null, null, query, query)]);
  } else {
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
  let fill = function (aInput, aList, aData) {
    $(aInput).tokenInput(peopleAutocomplete, {
      classes: autoCompleteClasses,
      prePopulate: aData,
    });
    $(aList+" li:not(.add-more)").remove();
    for each (let [i, { name, data: email }] in Iterator(aData)) {
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


