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
 * The Original Code is multiple message preview pane
 *
 * The Initial Developer of the Original Code is
 * Mozilla messaging
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Ascher <dascher@mozillamessaging.com>
 *   Jonathan Protzenko <jonathan.protzenko@gmail.com>
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

/* This file modifies threadsummaries.js by overriding a large part of the
 * original code (mainly ThreadSummary.summarize). Our functions are the result
 * of incremental modifications to the original ones, so that we can backport
 * the changes from main Thunderbird code more easily.
 *
 * Original comments are C++-style, mine are C-style.
 *
 * */

/* That's for event handlers. The stash is just a convenient way to store data
 * that needs to be made available to the event handlers. We also store in the
 * stash variables we don't want to be GC'd. */
let GCV = {
  /* Event handlers */
  on_load_thread: null,
  on_load_thread_tab: null,
  on_back: null,
  /* Used by both the in-conversation toolbar and the right-click menu */
  on_collapse_all: null,
  on_expand_all: null,
  mark_all_read: null,
  archive_all: null,
  delete_all: null,
  print: null,
  /* Prevent GC */
  stash: {
    wantedUrl: null, /* To disable the autoload handler if we explicitely requested that message */
    q1: null, /* Don't GC Gloda queries */
    q2: null,
    msgHdrs: [], /* To mark them read, to determine if it's a different conversation, and many more */
    msgNodes: {}, /* tKey => DOMNode */
    multiple_selection: false, /* Printing and archiving depend on these */
    expand_all: [], /* A list of closures */
    collapse_all: [],
    all_went_well: false /* Set to false before PART 1/3 and set to true after we received all signals. If not true, then isNewConversation == true always. */
  },
  /* The timeout number for the delayed "mark all read" call */
  mark_read_timeout: null
};

/* We use a function because of global namespace pollution. We use "onload"
 * because we need the <stringbundle> to be available. */
window.addEventListener("load", function f_temp0 () {
  window.removeEventListener("load", f_temp0, false); /* just to make sure */

  /* Classic */
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cu = Components.utils;
  const Cr = Components.results;
  Cu.import("resource://gconversation/VariousUtils.jsm", GCV);
  Cu.import("resource://gconversation/GlodaUtils.jsm", GCV);
  Cu.import("resource://gconversation/MsgHdrUtils.jsm", GCV);
  Cu.import("resource://gre/modules/PluralForm.jsm", GCV);
  Cu.import("resource:///modules/gloda/utils.js", GCV);

  /* Various magic values */
  const nsMsgViewIndex_None = 0xffffffff;
  const kCharsetFromMetaTag = 10;

  /* Cache component instanciation. */
  const gPrefBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch(null);
  const gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
  const gAccountManager  = Cc["@mozilla.org/messenger/account-manager;1"].getService(Ci.nsIMsgAccountManager);
  const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
  const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("gconversation.");
  const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);
  const stringBundle = document.getElementById("gconv-string-bundle");
  const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  const msgComposeService = Cc["@mozilla.org/messengercompose;1"].getService(Ci.nsIMsgComposeService);  
  const clipboardService = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);

  /* How I wish Javascript had algebraic data types */
  const kActionDoNothing = 0;
  const kActionExpand = 1;
  const kActionCollapse = 2;

  /* For debugging purposes */
  let consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
  function myDump(aMsg) {
    dump(aMsg);
    if (false && consoleService)
      consoleService.logStringMessage("GCV: "+aMsg);
  };

  /* This one we use all the time, stop redefining it everywhere, just assume it
   * will be available anywhere from now on */
  let htmlpane = document.getElementById('multimessage');

  /* Better debug function */
  let dumpCallStack = function dumpCallStack_ () {
    let frame = Components.stack;
    while (frame) {
      myDump(frame+"\n");
      frame = frame.caller;
    }
  }

  /* Preferences are loaded once and then observed. For a new pref, add an entry
   * here + a case in the switch below. */
  let gPrefs = {};
  gPrefs["standard_single_message_view"] = prefs.getBoolPref("standard_single_message_view");
  gPrefs["monospaced"] = prefs.getBoolPref("monospaced");
  gPrefs["monospaced_snippets"] = prefs.getBoolPref("monospaced_snippets");
  gPrefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
  gPrefs["fold_rule"] = prefs.getCharPref("fold_rule");
  gPrefs["focus_first"] = prefs.getBoolPref("focus_first");
  gPrefs["reverse_order"] = prefs.getBoolPref("reverse_order");
  gPrefs["disable_error_empty_collection"] = prefs.getBoolPref("disable_error_empty_collection");
  gPrefs["auto_mark_read"] = prefs.getBoolPref("auto_mark_read");
  gPrefs["monospaced_senders"] = Array.map(prefs.getCharPref("monospaced_senders").split(","), String.trim);
  gPrefs["info_af_shown"] = prefs.getBoolPref("info_af_shown");
  gPrefs["no_friendly_date"] = prefs.getBoolPref("no_friendly_date");
  gPrefs["guess_first_names"] = prefs.getBoolPref("guess_first_names");

  let myPrefObserver = {
    register: function mpo_register () {
      prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
      prefs.addObserver("", this, false);
    },

    unregister: function mpo_unregister () {
      if (!prefs) return;
        prefs.removeObserver("", this);
    },

    observe: function mpo_observe (aSubject, aTopic, aData) {
      if (aTopic != "nsPref:changed") return;
      /* Don't try to be subtle here. If we changed a pref, make sure we rebuild
       * the whole conversation. There are implicit assumptions in
       * restorePreviousConversation that the prefs haven't changed, and also if
       * we don't do this, prefs such as "use monospaced font"... or things like
       * that don't take effect until we load another conversation which is bad
       * for the user. */
      GCV.stash.msgHdrs = [];
      switch (aData) {
        case "standard_single_message_view":
        case "monospaced":
        case "monospaced_snippets":
        case "focus_first":
        case "reverse_order":
        case "auto_mark_read":
        case "disable_error_empty_collection":
        case "info_af_shown":
        case "no_friendly_date":
        case "guess_first_names":
          gPrefs[aData] = prefs.getBoolPref(aData);
          break;
        case "hide_quote_length":
          gPrefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
          break;
        case "fold_rule":
          gPrefs["fold_rule"] = prefs.getCharPref("fold_rule");
          break;
        /* Warning this one has no key in gPrefs */
        case "toolbar_mode":
          /* No need to store it anywhere. multimessageview.xhtml sets it on load, we process
           * the updates. */
          htmlpane.contentDocument.getElementById("header-view-toolbox").setAttribute("mode",
            prefs.getCharPref("toolbar_mode"));
          break;
        case "monospaced_senders":
          gPrefs["monospaced_senders"] = Array.map(prefs.getCharPref("monospaced_senders").split(","), String.trim);
          break;
      }
    }
  };
  myPrefObserver.register();

  /* Enigmail support, thanks to Patrick Brunschwig ! */
  let hasEnigmail = (typeof(GetEnigmailSvc) == "function");
  let enigmailSvc;
  if (hasEnigmail)
    enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    myDump("Error loading the Enigmail service. Is Enigmail disabled?\n");
    hasEnigmail = false;
  }
  function tryEnigmail(bodyElement) {
    if (bodyElement.textContent.indexOf("-----BEGIN PGP") < 0)
      return null;

    var signatureObj       = new Object();
    var exitCodeObj        = new Object();
    var statusFlagsObj     = new Object();
    var keyIdObj           = new Object();
    var userIdObj          = new Object();
    var sigDetailsObj      = new Object();
    var errorMsgObj        = new Object();
    var blockSeparationObj = new Object();

    try {
      var decryptedText =
        enigmailSvc.decryptMessage(window, 0, bodyElement.textContent,
          signatureObj, exitCodeObj,
          statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj,
          errorMsgObj, blockSeparationObj);
      if (exitCodeObj.value == 0) {
        if (decryptedText.length > 0) {
          bodyElement.textContent = decryptedText;
          bodyElement.style.whiteSpace = "pre-wrap";
        }
        return statusFlagsObj.value;
      }
    } catch (ex) {
      myDump("Enigmail error: "+ex+" --- "+errorMsgObj.value+"\n");
      return null;
    }
  }

  const predefinedColors = ["#204a87", "#5c3566", "#8f5902", "#a40000", "#4e9a06", "#db2c92",
                            "#662e25", "#4b958d", "#8ae234", "#f57900"]
  let gColorCount = 0;
  /* Filled as we go. key = "Jonathan Protzenko", value = "#ff0562" */
  let id2color = {};
  function resetColors () {
    id2color = {};
    gColorCount = 0;
  }
  /* This function returns a fresh color everytime it is called. After some
   * time, it starts inventing new colors of its own. */
  function newColor() {
    if (gColorCount < predefinedColors.length) {
      return predefinedColors[gColorCount++];
    } else {
      let r, g, b;
      /* Avoid colors that are too light or too dark */
      do {
        r = Math.random();
        g = Math.random();
        b = Math.random();
      } while (Math.sqrt(r*r + b*b + g*g) > .8 || Math.sqrt(r*r + b*b + g*g) < .2)
      return "rgb("+parseInt(r*255)+","+parseInt(g*255)+","+parseInt(b*255)+")";
    }
  }
  /* Return the color for a given person or create it */
  function colorFor(person) {
    let lPerson = person.toLowerCase();
    if (!id2color[lPerson])
      id2color[lPerson] = newColor();
    return id2color[lPerson];
  }

  /* Mark once and for all all of the user's email addresses */
  let gIdentities = {};
  for each (let identity in fixIterator(gAccountManager.allIdentities, Ci.nsIMsgIdentity)) {
    if (identity.email)
      gIdentities[identity.email] = true;
  }

  /* See
   * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#1060
   * for reference */
  let knownCards = {};
  function resetCards() {
    knownCards = {};
  }
  function authorEmail(aMsgHdr) {
    let emails = {};
    let fullNames = {};
    let names = {};
    let numAddresses = gHeaderParser.parseHeadersWithArray(aMsgHdr.mime2DecodedAuthor, emails, names, fullNames);
    if (numAddresses > 0)
      return emails.value[0];
    else
      return "";
  }
  let meTo = stringBundle.getString("me_as_in_me_to");
  let toMe = stringBundle.getString("me_as_in_to_me");
  function processEmails (emailAddresses, isSender, aDoc) {
    let addresses = {};
    let fullNames = {};
    let names = {};
    let numAddresses = 0;
    let decodedAddresses = [];

    numAddresses = gHeaderParser.parseHeadersWithArray(emailAddresses, addresses, names, fullNames);
    for (let i = 0; i < numAddresses; ++i) {
      let email = addresses.value[i];
      if (knownCards[email]) {
        decodedAddresses.push(knownCards[email]);
      } else {
        let card = {};
        card.emailAddress = email;
        card.fullAddress = fullNames.value[i];
        card.displayName = names.value[i];
        let cardDetails = getCardForEmail(card.emailAddress);
        if (cardDetails.card) { /* We know the guy */
          //myDump("Got a card for "+address.emailAddress+"!\n");
          card.inAB = true;
          card.cardDetails = cardDetails; /* A bit weird, I agree */
          card.displayName = cardDetails.card.displayName;
          card.firstName = cardDetails.card.firstName;
          card.phone =
               cardDetails.card.getProperty("CellularNumber", "")
            || cardDetails.card.getProperty("WorkPhone", "")
            || cardDetails.card.getProperty("HomePhone", "")
          ;
          card.address =
              [cardDetails.card.getProperty("HomeAddress", ""),
               cardDetails.card.getProperty("HomeAddress2", ""),
               cardDetails.card.getProperty("HomeCity", ""),
               cardDetails.card.getProperty("HomeZipCode", "")]
              .filter(function (x) x.length > 0)
              .join("\n")
            ||
              [cardDetails.card.getProperty("WorkAddress", ""),
               cardDetails.card.getProperty("WorkAddress2", ""),
               cardDetails.card.getProperty("WorkCity", ""),
               cardDetails.card.getProperty("WorkZipCode", "")]
              .filter(function (x) x.length > 0)
              .join("\n")
          ;
          let birthday = new Date();
          let bDay = cardDetails.card.getProperty("BirthDay", null);
          let bMonth = cardDetails.card.getProperty("BirthMonth", null);
          if (bDay && bMonth) {
            birthday.setMonth(bMonth - 1); /* I hate this!!! */
            birthday.setDate(bDay);
            card.birthday = birthday.toLocaleFormat("%B %d");
          }
        }
        if (gIdentities[card.emailAddress]) { /* OMG ITS ME */
          /* See
           * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#1130
           * for reference */
          card.displayName = isSender ? meTo : toMe;
        }
        decodedAddresses.push(card);
        knownCards[email] = card;
      }
    }

    function colorize(card) {
      /* Compute various values */
      let name = card.displayName || card.emailAddress;
      let title = card.displayName ? card.emailAddress : "";
      let fullName = name;
      let shortName = gPrefs["guess_first_names"]
        ? card.firstName || GCV.parseShortName(name)
        : name;
      let gravatarUrl = "http://www.gravatar.com/avatar/"
        + GCV.GlodaUtils.md5HashString(card.emailAddress.trim().toLowerCase())
        + "?r=pg&d=wavatar&s=50";
      let colorStyle = "display: inline; color: "+colorFor(card.emailAddress);

      let addAbTxt = stringBundle.getString("add_address_book");
      let editDetailsTxt = stringBundle.getString("edit_details");
      let composeToTxt = stringBundle.getString("compose_to");
      let copyEmailTxt = stringBundle.getString("copy_email");
      let showInvolvingTxt = stringBundle.getString("show_involving");

      /* Fill the dialog <div> with them */
      let dialogNode = 
        <div style="width: 300px; display: none" class="contact-dialog">
          <div>
            <img src={gravatarUrl} class="info-popup-gravatar" />
            <div class="info-popup-name-email">
              <span class="info-popup-display-name">{card.displayName}<br /></span>
              <span class="info-popup-display-email">{card.emailAddress}</span>
            </div>
          </div>
          <div class="info-popup-contact-info">
            <table>
              <tr class="phone">
                <td>
                  <img src="chrome://gconversation/skin/phone.png" />
                </td>
                <td>
                  {card.phone}
                </td>
              </tr>
              <tr class="address">
                <td>
                  <img src="chrome://gconversation/skin/house.png" />
                </td>
                <td>
                  <span style="white-space: pre-wrap">{card.address}</span>
                </td>
              </tr>
              <tr class="birthday">
                <td>
                  <img src="chrome://gconversation/skin/cake.png" />
                </td>
                <td>
                  {card.birthday}
                </td>
              </tr>
            </table>
          </div>
          <div class="info-popup-links">
            <a href="javascript:" class="link-action-add-ab">{addAbTxt}</a> -
            <a href="javascript:" class="link-action-edit-ab">{editDetailsTxt}</a> -
            <a href="javascript:" class="link-action-compose-to">{composeToTxt}</a> -
            <a href="javascript:" class="link-action-copy-email">{copyEmailTxt}</a> -
            <a href="javascript:" class="link-action-show-involving">{showInvolvingTxt}</a>
          </div>
        </div>;

      /* Create the small <div> that olds the short name and the full name */
      let linkNode =
        <div class="link contact-link" style={colorStyle}>
          <span class="short-name">{shortName}</span>
          <span class="full-name">{fullName}</span>
        </div>;

      /* Wrap them both in a bigger <div> */
      let span = aDoc.createElement("div");
      span.classList.add("display-as-inline");
      span.innerHTML = linkNode.toXMLString() + dialogNode.toXMLString();

      /* Hide unnecessary UI items */
      if (!card.displayName)
        span.getElementsByClassName("info-popup-display-name")[0].style.display = "none";
      if (!card.phone)
        span.getElementsByClassName("phone")[0].style.display = "none";
      if (!card.address)
        span.getElementsByClassName("address")[0].style.display = "none";
      if (!card.birthday)
        span.getElementsByClassName("birthday")[0].style.display = "none";
      if (!card.address && !card.phone && !card.birthday)
        span.getElementsByClassName("info-popup-contact-info")[0].style.display = "none";

      /* Register the "show involving" action */
      let showLink = span.getElementsByClassName("link-action-show-involving")[0];
      showLink.addEventListener("click", function (event) {
          let q1 = Gloda.newQuery(Gloda.NOUN_IDENTITY);
          q1.kind("email");
          q1.value(card.emailAddress);
          GCV.stash.q1 = q1.getCollection({
              onItemsAdded: function _onItemsAdded(aItems, aCollection) {  },
              onItemsModified: function _onItemsModified(aItems, aCollection) { },
              onItemsRemoved: function _onItemsRemoved(aItems, aCollection) { },
              onQueryCompleted: function _onQueryCompleted(aCollection) {
                if (!aCollection.items.length)
                  return;  

                let q2 = Gloda.newQuery(Gloda.NOUN_MESSAGE);
                q2.involves.apply(q2, aCollection.items);
                GCV.stash.q2 = q2.getCollection({
                  onItemsAdded: function _onItemsAdded(aItems, aCollection) {  },
                  onItemsModified: function _onItemsModified(aItems, aCollection) {  },
                  onItemsRemoved: function _onItemsRemoved(aItems, aCollection) {  },
                  onQueryCompleted: function _onQueryCompleted(aCollection) {  
                    let tabmail = document.getElementById("tabmail");
                    aCollection.items =
                      [GCV.selectRightMessage(m)
                      for each ([, m] in Iterator(GCV.groupMessages(aCollection.items)))];
                    aCollection.items = aCollection.items.filter(function (x) x);
                    tabmail.openTab("glodaList", {
                      collection: aCollection,
                      title: stringBundle.getString("involving").replace("#1", card.displayName),
                      background: false
                    });
                  }
                });
              }
            });
        }, true);

      /* Register the "copy email address" action */
      let copyLink = span.getElementsByClassName("link-action-copy-email")[0];
      copyLink.addEventListener("click", function (event) {
          clipboardService.copyString(card.emailAddress);
        }, true);

      /* Register the compose message to action */
      let composeLink = span.getElementsByClassName("link-action-compose-to")[0];
      composeLink.addEventListener("click", function (event) {
          let URI = ioService.newURI("mailto:"+card.emailAddress, null, null);  
          msgComposeService.OpenComposeWindowWithURI(null, URI);
        }, true);

      /* Register the edit details / add to address book actions */
      if (card.inAB) {
        let addAb = span.getElementsByClassName("link-action-add-ab")[0];
        addAb.style.display = "none";
        addAb.nextSibling.textContent = "";
        let editAb = span.getElementsByClassName("link-action-edit-ab")[0];
        editAb.addEventListener("click", function (event) {
          window.openDialog("chrome://messenger/content/addressbook/abEditCardDialog.xul",
                            "",
                            "chrome,modal,resizable=no,centerscreen",
                            { abURI: card.cardDetails.book.URI,
                              card: card.cardDetails.card });

          }, true);
      } else {
        let editAb = span.getElementsByClassName("link-action-edit-ab")[0];
        editAb.style.display = "none";
        editAb.nextSibling.textContent = "";
        let addAb = span.getElementsByClassName("link-action-add-ab")[0];
        addAb.addEventListener("click", function (event) {
            let args = {
              primaryEmail: card.emailAddress,
              displayName: card.displayName,
              allowRemoteContent: true
            };
            window.openDialog("chrome://messenger/content/addressbook/abNewCardDialog.xul",
                              "", "chrome,resizable=no,titlebar,modal,centerscreen", args);
          }, true);
      }

      /* Small cleanups */
      let removeTrailingTextNode = function (klass) {
        let link = span.getElementsByClassName(klass)[0];
        if (link.nextSibling && link.nextSibling.nodeType == link.nextSibling.TEXT_NODE
            && link.nextSibling.textContent.trim().length === 0)
          link.parentNode.removeChild(link.nextSibling);
      };
      removeTrailingTextNode("full-name");
      removeTrailingTextNode("short-name");
      removeTrailingTextNode("link");

      return span;
    }
    return [colorize(a) for each ([, a] in Iterator(decodedAddresses))];
  }

  /* This function is now also used by summarizeThread and the autoload event
   * handler. When the conversation is the same, we don't rebuild it. However,
   * all focus information has been lost, so we need to re-trigger this function
   * to scroll back the right message into view. */
  function scrollNodeIntoView (aMsgNode) {
    if (aMsgNode.offsetTop) {
      let offset = aMsgNode.offsetTop;
      let parent = aMsgNode.parentNode;
      while (parent && !(parent instanceof HTMLDocument)) {
        let style = htmlpane.contentWindow.getComputedStyle(parent, null);
        if (style.position == "relative")
          offset += parent.offsetTop;
        parent = parent.parentNode;
      }
      htmlpane.contentWindow.scrollTo(0, offset - 5);
    }
  }

  /* From a set of message headers, return the index of the message that needs
   * focus (in the msgHdrs list) and the DOM index this message has (that takes
   * care of gPrefs["reverse_order"]) */
  function tellMeWhoToFocus(aMsgHdrs) {
    /* Determine which message is going to be focused */
    let needsFocus = -1;
    if (gPrefs["focus_first"]) {
      needsFocus = aMsgHdrs.length - 1;
      for (let i = 0; i < aMsgHdrs.length; ++i) {
        if (!aMsgHdrs[i].isRead) {
          needsFocus = i;
          break;
        }
      }
    } else {
      let uri = function (msg) msg.folder.getUriForMsg(msg);
      let key = uri(gFolderDisplay.selectedMessage);
      myDump("Currently selected message key is "+key+"\n");
      for (let i = 0; i < aMsgHdrs.length; ++i) {
        myDump("Examining "+uri(aMsgHdrs[i])+"\n");
        if (uri(aMsgHdrs[i]) == key) {
          needsFocus = i;
          break;
        }
      }
    }

    myDump(aMsgHdrs.length+" messages total, focusing "+needsFocus+"\n");
    return needsFocus;
  }

  /* Do the mapping */
  function msgHdrToMsgNode(aMsgHdr) {
    if (!aMsgHdr)
      dumpCallStack();
    let tKey = aMsgHdr.messageKey + aMsgHdr.folder.URI;
    return GCV.stash.msgNodes[tKey];
  }

  /* From a set of message headers, tell which ones should be expanded */
  function tellMeWhoToExpand(aMsgHdrs, aNeedsFocus) {
    let actions = [];
    let collapse = function collapse_ (msgNode) {
      if (msgNode.classList.contains("collapsed"))
        actions.push(kActionDoNothing);
      else
        actions.push(kActionCollapse);
    };
    let expand = function expand_ (msgNode) {
      if (msgNode.classList.contains("collapsed"))
        actions.push(kActionExpand);
      else
        actions.push(kActionDoNothing);
    };
    switch (gPrefs["fold_rule"]) {
      case "focused":
        for each (let [i, msgHdr] in Iterator(aMsgHdrs)) {
          let msgNode = msgHdrToMsgNode(msgHdr);
          if (i == aNeedsFocus)
            expand(msgNode);
          else
            collapse(msgNode);
        }
        break;
      case "unread_and_last":
        for each (let [i, msgHdr] in Iterator(aMsgHdrs)) {
          let msgNode = msgHdrToMsgNode(msgHdr);
          if (!msgHdr.isRead || i == aNeedsFocus)
            expand(msgNode);
          else
            collapse(msgNode);
        }
        break;
      case "all":
        for each (let [, msgHdr] in Iterator(aMsgHdrs)) {
          let msgNode = msgHdrToMsgNode(msgHdr);
          expand(msgNode);
        }
        break;
      case "none":
        for each (let [, msgHdr] in Iterator(aMsgHdrs)) {
          let msgNode = msgHdrToMsgNode(msgHdr);
          collapse(msgNode);
        }
        break;
    }
    return actions;
  }


  /*                    TODAY'S GORY DETAILS
   *
   * Semantics: when we first use tab to jump to the message list to the
   * conversation view, we want either the first selected message in the
   * folder view, or the first unread message / last message (depending on
   * the preference) to gain focus. Afterwards, we want tab/shift-tab to
   * cycle through the messages normally. Shift-tab with the 0-th message
   * focused will send you back to the message list. Tab from the message
   * list will send you to the 0-th message. The special behaviour is for
   * the first tab-jump only.
   *
   * How do we make sure we jump to the needsFocus-th message when we tab to
   * the conversation view?
   * - tabindexes for each .message range from 2 to numMessages + 1 EXCEPT THAT
   * - the message that needs focus has index 1 so that it is selected first
   *   when we tab-jump to the conversation view
   * - however, we need to modify this tabindex so that when we hit tab or
   *   shift-tab afterwards, the results are "normal"
   * - this DOESN'T work for Gecko 1.9.1 (now cry with me) because the
   *   tabindexes are cached in some way and even though the tabindex
   *   attribute has been updated, the old value is taken into account to
   *   compute which <div> to focus when we hit tab or shift-tab
   * - but it works for 1.9.2...
   * */

  /* Deal with the currently selected message */
  function variousFocusHacks (aMsgNode) {
    /* We want the node that's been expanded (the one that has index
     * needsFocus) to also have the visual appearance with the cursor. */
    aMsgNode.classList.add("selected");
    aMsgNode.setAttribute("tabindex", 1);
    htmlpane.contentDocument.addEventListener("focus", function on_focus (event) {
        htmlpane.contentDocument.removeEventListener("focus", on_focus, true);
        let msgNode = htmlpane.contentDocument.querySelector(".message.selected");
        if (!msgNode)
          return;

        /* This is a persistent event listener. It can operate multiple
         * times. Actually, since we don't rebuild conversations when the
         * message set is the same, we restore the tabindex hack and the
         * selected state, so this handler must still be able to operate
         * properly. */

        /* However, when the thread summary gains focus, we need to
         * remove that class because :focus will take care of that */
        msgNode.classList.remove("selected");
        /* Restore the proper tab order. This event is fired *after* the
         * right message has been focused in Gecko 1.9.2, *before* the right
         * message has been focused in Gecko 1.9.1 (so it's basically
         * useless). */
        if (msgNode.previousElementSibling)
          msgNode.setAttribute("tabindex",
            parseInt(msgNode.previousElementSibling.getAttribute("tabindex"))+1);
        else /* It's the first one in the list */
          msgNode.setAttribute("tabindex", 2);
      }, true);
  }


  /* Ok, deal with signals. The semantics are as follows:
   * - when you expand a message, a signal is sent as soon as the message is
   *   fully displayed (this *might* be asynchronous)
   * - when you collapse a message, a signal is sent as well
   * - once the expected numbers of signals have been triggered, launch the
   *   final function
   * - when the mime summary and extra information have been added too, a
   *   signal is sent (so take that into account for the first load)
   * */
  let nSignals = -1;
  let fSignals = function () {};
  let signal = function () {
    nSignals--;
    if (nSignals == 0) {
      fSignals();
    }
  };
  let runOnceAfterNSignals = function runOnceAfterNSignals_ (n, f) {
    /* This trick takes care of the case n === 0 */
    fSignals = f;
    nSignals = n + 1;
    signal();
  };

  ThreadSummary.prototype = {
    __proto__: MultiMessageSummary.prototype,

    summarize: function ThreadSummary_summarize() {
      this._msgNodes = {};

      /* We need to keep them at hand for the "Mark all read" command to work
       * properly (and others). THis is set by the original constructor that
       * we're not overriding here, see the original selectionsummaries.js */
      GCV.stash.msgHdrs = this._msgHdrs;
      GCV.stash.msgNodes = this._msgNodes;
      GCV.stash.expand_all = [];
      GCV.stash.collapse_all = [];

      /* Reset the set of known colors */
      resetColors();

      /* Reset the cards. That way, if I add someone in the adress book, the
       * next time this conversation is loaded, we use their first name. */
      resetCards();

      /* Fill the heading */
      let firstMsgHdr = this._msgHdrs[0];
      let numMessages = this._msgHdrs.length;
      let subject = (firstMsgHdr.mime2DecodedSubject || gSelectionSummaryStrings["noSubject"])
         + " "
         + GCV.PluralForm.get(numMessages, gSelectionSummaryStrings["Nmessages"]).replace('#1', numMessages);
      let heading = htmlpane.contentDocument.getElementById('heading');
      heading.setAttribute("class", "heading");
      heading.textContent = subject;

      /* Remove messages leftover from a previous conversation */
      let messagesElt = htmlpane.contentDocument.getElementById('messagelist');
      while (messagesElt.firstChild)
        messagesElt.removeChild(messagesElt.firstChild);

      let count = 0;
      const MAX_THREADS = 100;
      const SNIPPET_LENGTH = 300;
      let maxCountExceeded = false;

      /* We can't really trust "this" to remain valid. */
      let msgHdrs = this._msgHdrs;
      let msgNodes = this._msgNodes;

      /* First step: will wait for all the calls to MsgHdrToMimeMessage to
       * terminate, which fills the references to expandAttachments (if we don't
       * do that, we might call expand_all[i] before expandAttachments is
       * complete, which in turn would result in no attachments at all
       * displayed). */
      let needsFocus = tellMeWhoToFocus(msgHdrs);
      GCV.stash.all_went_well = false;
      let self = this;
      myDump("                                                PART 1/3\n");
      runOnceAfterNSignals(
        numMessages,
        function collapseExpandAsNeeded_ () {
          myDump("                                                PART 2/3\n");

          /* Final step: scroll the right message into view, and set it as
           * selected */
          runOnceAfterNSignals(
            numMessages,
            function scrollToTheRightNode_ () {
              myDump("                                                PART 3/3\n");
              let msgNode = msgHdrToMsgNode(msgHdrs[needsFocus]);
              scrollNodeIntoView(msgNode);
              variousFocusHacks(msgNode);

              /* There's at least three reasons why we want to delay that call.
               * - We want the gloda query that's been launched before to be
               *   ready to watch for read/unread change events, so the delay
               *   leaves it time to complete
               * - In case a reflow occurs, we kill the previous pending "mark
               *   as read" timeout, and wait once more --> mitigates the risks
               *   of the first reflow marking all messages as read, and the
               *   second one coming right after because of a message list
               *   refresh and missing unread messages
               * - Be consistent with the global policy. */
              GCV.mark_read_timeout = setTimeout(function () {
                  if (gPrefs["auto_mark_read"] && document.hasFocus())
                    GCV.mark_all_read();
                }, 250);
              /* XXX use mailnews.threadpane_select_delay's real value */

              /* This is the end of it all, so be confident our conversation is
               * properly built and complete. This is specifically to avoid the
               * following sequence of events:
               * - pullConversation is launched
               * - user switches back to single message view
               * - multimessageview.xhtml is not visible anymore
               * - the fillMessageSnippetAndHTML callback kicks in
               * - tries to set a height on the iframe (auto-resizing issue,
               *   again)
               * - fails because the height is not available since it's never
               *   been displayed (remember, the conversation is not visible
               *   anymore)
               * - the user comes backs to the exact same conversation
               * - isNewConversation == false
               * - the conversation's messages are 20px high... good!
               **/
              GCV.stash.all_went_well = true;
            });

          // stash somewhere so it doesn't get GC'ed
          self._glodaQueries.push(
            Gloda.getMessageCollectionForHeaders(self._msgHdrs, self));

          /* Second step: expand all the messages that need to be expanded. All
           * messages are collapsed by default, we enforce this. */
          let actionList = tellMeWhoToExpand(msgHdrs, needsFocus);
          for each (let [i, action] in Iterator(actionList)) {
            switch (action) {
              case kActionDoNothing:
                signal();
                break;
              case kActionCollapse:
                throw "Why collapse a message?";
                break;
              case kActionExpand:
                GCV.stash.expand_all[i]();
                break;
              default:
                throw "Never happens";
                break;
            }
          }
        }
      );

      myDump("*** We have "+numMessages+" messages to process\n");

      /* Now this is for every message. Note to self: all functions defined
       * inside the loop must be defined using let f = ... (otherwise the last
       * definition is always called !). Note to self: i is shared accross all
       * the loop executions. Note to self: don't rely on [this]. */
      for (let i = 0; i < numMessages; ++i) {
        let iCopy = i; /* Jonathan, we're not in OCaml, i is NOT immutable */

        myDump("*** Dealing with message "+i+"\n");
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }

        let msgHdr = this._msgHdrs[i];
        let key = msgHdr.messageKey + msgHdr.folder.URI;

        let theSubject = msgHdr.mime2DecodedSubject;
        let dateObject = new Date(msgHdr.date/1000);
        let date = gPrefs["no_friendly_date"]
          ? GCV.dateAsInMessageList(dateObject)
          : makeFriendlyDateAgo(dateObject);

        /* The snippet class really has a counter-intuitive name but that allows
         * us to keep some style from the original multimessageview.css without
         * rewriting everything */
        let stdReaderText = stringBundle.getString("std_reader");
        let replyTxt = stringBundle.getString("reply");
        let replyAllTxt = stringBundle.getString("reply_all");
        let forwardTxt = stringBundle.getString("forward");
        let archiveTxt = stringBundle.getString("archive");
        let deleteTxt = stringBundle.getString("delete");
        let replyList = stringBundle.getString("reply_list");
        let editNew = stringBundle.getString("edit_new");
        let composeAll = stringBundle.getString("compose_all");
        let moreActionsTxt = stringBundle.getString("more_actions");
        let toTxt = stringBundle.getString("to");
        let detailsTxt = stringBundle.getString("more");
        let editDraftTxt = stringBundle.getString("edit_draft");
        let toggleRead = stringBundle.getString("toggle_read2");
        let toggleFont = stringBundle.getString("toggle_font");
        let noGlodaTxt = stringBundle.getString("no_gloda");
        let enigEncOk = stringBundle.getString("enig_enc_ok");
        let enigSignOk = stringBundle.getString("enig_sign_ok");
        let enigSignUnknown = stringBundle.getString("enig_sign_unknown");
        let viewSourceTxt = stringBundle.getString("view_source");
        let msgContents =
          <div class="row">
            <div class="pointer" />
            <div class="notification-icons">
              <div class="std-reader link" title={stdReaderText} />
              <div class="star"/>
              <div class="enigmail-enc-ok" title={enigEncOk} style="display: none" />
              <div class="enigmail-sign-ok" title={enigSignOk} style="display: none" />
              <div class="enigmail-sign-unknown" title={enigSignUnknown} style="display: none" />
              <div class="attachment" style="display: none"></div>
              <div class="tags"></div>
            </div>
            <div class="link-action-area">
              <a class="action link-reply">{replyTxt}</a>
              <a class="action link-reply-all">{replyAllTxt}</a>
              <a class="action link-forward">{forwardTxt}</a>
              <a class="action toggle-font link" style="display: none" title={toggleFont}>
                <img src="chrome://gconversation/skin/font.png" />
              </a>
              <a class="action mark-read link" title={toggleRead}>
                <img src="chrome://gconversation/skin/readcol.png" />
              </a>
              <a class="action delete-msg link" title={deleteTxt}>
                <img src="chrome://gconversation/skin/trash.gif" />
              </a>
            </div>
            <div class="header">
              <div class="wrappedsender">
                <div class="msgheader-details-date">
                  <div class="date">{date}</div>
                  <div class="fg-tooltip fg-tooltip-right ui-widget ui-state-highlight ui-corner-all" style="display: none">
                    <span class="remove-me">{noGlodaTxt}</span>
                    <div class="view-source">
                      <div class="link view-source-link">
                        {viewSourceTxt}
                      </div>
                    </div>
                    <div class="fg-tooltip-pointer-up ui-state-highlight">
                      <div class="fg-tooltip-pointer-up-inner"></div>
                    </div>
                  </div>
                  <div class="tooltip msgheader-details-toggle">
                    {detailsTxt}
                  </div>
                </div>
                <div class="msgheader-from">
                  <div class="sender"></div>
                  <div class="to-text">{toTxt}</div>
                </div>
                <div class="msgheader-to">
                  <div class="recipients"></div>
                  <div class="draft-warning" title={editDraftTxt}></div>
                </div>
                <div class="attachments-area">
                </div>
              </div>
              <div class="snippet snippetmsg"></div>
              <div class="plaintextmsg" style="display: none;"></div>
              <div class="snippet htmlmsg" style="" xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"></div>
              <div class="attachments-box-handler" />
              <div class="button-action-area">
                <div class="button-area-left fg-buttonset">
                  <button class="link fg-button ui-state-default ui-corner-all button-reply">
                    {replyTxt}
                  </button>
                  <button class="link fg-button ui-state-default ui-corner-all button-forward">
                    {forwardTxt}
                  </button>
                  <button class="link fg-button ui-state-default ui-corner-all button-more-actions">
                    {moreActionsTxt}
                    <div style="display: inline-block; vertical-align: middle"
                      class="ui-icon ui-icon-triangle-1-s"></div>
                  </button>
                  <div style="display: none;">
                    <ul class="menu-more-actions">
                      <li><a href="javascript:" class="link menu-editNew">{editNew}</a></li>
                      <li><a href="javascript:" class="link menu-replyList">{replyList}</a></li>
                      <li><a href="javascript:" class="link menu-composeAll">{composeAll}</a></li>
                    </ul>
                  </div>
                </div>
                <div class="button-area-right fg-buttonset">
                  <button class="link fg-button ui-state-default ui-corner-all button-archive">
                    {archiveTxt}
                  </button>
                  <button class="link fg-button ui-state-default ui-corner-all button-delete">
                    {deleteTxt}
                  </button>
                </div>
              </div>
            </div>
            <div class="grip ui-icon ui-icon-grip-diagonal-se" />
          </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        this._msgNodes[key] = msgNode;
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();

        msgNode.classList.add("message");
        msgNode.classList.add("collapsed");
        if (!msgHdr.isRead)
          msgNode.classList.add("unread");
        if (msgHdr.isFlagged)
          msgNode.classList.add("starred");

        /* That only changes the order in which the nodes are inserted, not the
         * index they have in this._msgHdrs */
        if (gPrefs["reverse_order"]) {
          messagesElt.insertBefore(msgNode, messagesElt.firstChild);
        } else {
          messagesElt.appendChild(msgNode);
        }

        /* We're using some forward references here. */
        let expandIframe = function () { myDump("YOU SHOULD NOT SEE THIS\n"); };
        let expandAttachments = function () { myDump("No attachments found ("+iCopy+")\n"); };
        let toggleMessage = function toggleMessage_ () {
          msgNode.classList.toggle("collapsed");
        };
        GCV.stash.expand_all.push(function () {
          if (msgNode.classList.contains("collapsed")) {
            toggleMessage();
            expandAttachments();
            expandIframe(); /* takes care of calling signal() */
          }
        });
        GCV.stash.collapse_all.push(function () {
          if (!msgNode.classList.contains("collapsed")) {
            toggleMessage(); /* Immediate */
            signal();
          }
        });

        /* Warn the user if this is a draft.
         * XXX we should probably provide a way to start editing said Draft */
        if (GCV.msgHdrIsDraft(msgHdr)) {
          let draftTxt = stringBundle.getString("draft");
          msgNode.getElementsByClassName("draft-warning")[0].textContent = draftTxt;
        }

        /* Handle tags associated to messages. The default styles are ugly,
         * fortunately, we do something about it in the css. */
        let tagsNode = msgNode.getElementsByClassName("tags")[0];
        let tags = this.getTagsForMsg(msgHdr);
        for each (let [,tag] in Iterator(tags)) {
          let tagNode = tagsNode.ownerDocument.createElement('span');
          // see tagColors.css
          let colorClass = "blc-" + this._msgTagService.getColorForKey(tag.key).substr(1);
          tagNode.classList.add("tag");
          //tagNode.classList.add(tag.tag);
          tagNode.classList.add(colorClass);
          tagNode.textContent = tag.tag;
          tagsNode.appendChild(tagNode);
        }

        /* Various useful DOM nodes */
        let senderNode = msgNode.getElementsByClassName("sender")[0];
        let recipientsNode = msgNode.getElementsByClassName("recipients")[0];
        let htmlMsgNode = msgNode.getElementsByClassName("htmlmsg")[0];
        let plainTextMsgNode = msgNode.getElementsByClassName("plaintextmsg")[0];
        let snippetMsgNode = msgNode.getElementsByClassName("snippetmsg")[0];
        let toggleFontNode = msgNode.getElementsByClassName("toggle-font")[0];

        /* We need to do this now because we're still collapsed AND we're
         * guaranteed to be synchronous here. The callback from
         * MsgHdrToMimeMessage might come later and maybe it changed the
         * senders' value to something more meaningful, but in this case, there
         * was only one recipient (because it's a Bugzilla) so that doesn't
         * trigger overflow (because the user is not insane and doesn't have a
         * 100px-wide message reader. if he does, screw him).
         * */
        let senderSpans = processEmails(msgHdr.mime2DecodedAuthor, true, htmlpane.contentDocument);
        if (senderSpans.length)
          senderNode.appendChild(senderSpans[0]);

        /* Deal with recipients */
        let recipientsSpans = processEmails(msgHdr.mime2DecodedRecipients, false, htmlpane.contentDocument);
        let ccSpans = processEmails(msgHdr.ccList, false, htmlpane.contentDocument);
        let bccSpans = processEmails(msgHdr.bccList, false, htmlpane.contentDocument);
        for each (let [, span] in Iterator(bccSpans)) {
          span.classList.add("bcc-recipient");
        }
        let overflowed = false;
        let lastComma;
        /* Ok, we're being a bit picky here, but if we don't overflow, we might
         * re-trigger overflow because we add " ..." at the end through CSS
         * which in turn causes extra length to be added. So create a fake node
         * at the beginning which will have the same width, and remove it when
         * we're done. Please note that this works because we added overflow-y:
         * scroll to the window. Otherwise, the scrollbar would appear later and
         * that would shrink the messages width AFTER our computations and
         * invalidate our overflow computations. */
        let fakeNode = htmlpane.contentDocument.createElement("span");
        fakeNode.textContent = " … ";
        recipientsNode.appendChild(fakeNode);
        for each (let [, span] in Iterator(recipientsSpans.concat(ccSpans).concat(bccSpans))) {
          recipientsNode.appendChild(span);
          let comma = htmlpane.contentDocument.createElement("span");
          comma.textContent= ", ";
          recipientsNode.appendChild(comma);

          let justOverflowed = function () recipientsNode.offsetTop > senderNode.offsetTop;
          if (overflowed || justOverflowed()) {
            comma.classList.add("too-long");
            span.classList.add("too-long");
            if (!overflowed && lastComma)
              lastComma.classList.add("last-comma");
            overflowed = true;
          }
          lastComma = comma;
        }
        if (lastComma)
          recipientsNode.removeChild(lastComma);
        else /* No recipients at all */
          msgNode.getElementsByClassName("to-text")[0].style.display = "none";
        recipientsNode.removeChild(fakeNode);

        /* Style according to the preferences. Preferences have an observer, see
         * above for details. */
        if (gPrefs["monospaced"])
          htmlMsgNode.classList.add("monospaced-message");
        if (gPrefs["monospaced_snippets"])
          snippetMsgNode.classList.add("monospaced-snippet");

        /* Try to enable at least some keyboard navigation */
        let tabIndex = gPrefs["reverse_order"] ? numMessages - i : i;
        /* 0 is not a valid tabIndex, and 1 is for the message that we want to
         * jump to the first time we use tab to jump from the message list to
         * the conversation view. variousFocusHacks will reset the value when
         * we're done with everything. */
        tabIndex++; tabIndex++;
        msgNode.setAttribute("tabindex", tabIndex);

        /* Register event handler for reply, reply to all, forward links. For
         * reference, start reading
         * http://mxr.mozilla.org/comm-central/source/mail/base/content/messageWindow.js#949
         * and follow the function definitions. */
        let uri = msgHdr.folder.getUriForMsg(msgHdr);
        let compose = function compose_ (aCompType, aEvent) {
          if (aEvent.shiftKey) {
            ComposeMessage(aCompType, Ci.nsIMsgCompFormat.OppositeOfDefault, msgHdr.folder, [uri]);
          } else {
            ComposeMessage(aCompType, Ci.nsIMsgCompFormat.Default, msgHdr.folder, [uri]);
          }
        };
        let register = function register_ (selector, f, action) {
          if (!action)
            action = "click";
          let nodes = selector ? msgNode.querySelectorAll(selector) : [msgNode];
          for each (let [, node] in Iterator(nodes))
            node.addEventListener(action, f, true);
        }

        register(".view-source-link", function(event) {
            ViewPageSource([uri]); /* mailCommands.js, maybe */
          });
        register(".draft-warning", function (event) {
            compose(Ci.nsIMsgCompType.Draft, event);
          });
        register(".link-reply, .button-reply", function (event) {
            /* XXX this code should adapt when news messages have a JS
             * representation. I don't think this will ever happen. See
             * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailWindowOverlay.js#1259
             * */
            compose(Ci.nsIMsgCompType.ReplyToSender, event);
          });
        register(".link-reply-all", function (event) {
            compose(Ci.nsIMsgCompType.ReplyAll, event);
          });
        let forward = function (event) {
            let forwardType = 0;
            try {
              forwardType = gPrefBranch.getIntPref("mail.forward_message_mode");
            } catch (e) {
              myDump("Unable to fetch preferred forward mode\n");
            }
            if (forwardType == 0)
              compose(Ci.nsIMsgCompType.ForwardAsAttachment, event);
            else
              compose(Ci.nsIMsgCompType.ForwardInline, event);
          };
        register(".link-forward, .button-forward", forward);
        register(".menu-replyList", function (event) {
            compose(Ci.nsIMsgCompType.ReplyToList, event);
          });
        register(".menu-editNew", function (event) {
            compose(Ci.nsIMsgCompType.Template, event);
          });
        register(".menu-composeAll", function (event) {
            let allEmails = [msgHdr.mime2DecodedAuthor]
                .concat(msgHdr.mime2DecodedRecipients)
                .concat(msgHdr.ccList);
            let emailAddresses = {};
            numAddresses = gHeaderParser.parseHeadersWithArray(allEmails, emailAddresses, {}, {});
            for (let i = 0; i < numAddresses; ++i) {
              if (gIdentities[emailAddresses.value[i]])
                allEmails[i] = null;
            }
            let composeAllUri = "mailto:" +
              allEmails
                .filter(function (x) x != null)
                .join(",");

            aURI = ioService.newURI(composeAllUri, null, null);  
            msgComposeService.OpenComposeWindowWithURI(null, aURI);
          });
        register(".action.delete-msg, .button-delete", function deletenode_listener (event) {
            /* Includes messages hidden by a collapsed thread */
            let selectedMessages = gFolderDisplay.selectedMessages;
            /* Does not */
            let l = gFolderDisplay.selectedIndices.length;
            GCV.msgHdrsDelete([msgHdr]);
            if (l > 1)
              gFolderDisplay.selectMessages(selectedMessages.filter(function (x) x.messageId != msgHdr.messageId));
          });
        register(".button-archive", function archive_listener (event) {
            let selectedMessages = gFolderDisplay.selectedMessages;
            let l = gFolderDisplay.selectedIndices.length;
            GCV.msgHdrsArchive([msgHdr], window);
            if (l > 1)
              gFolderDisplay.selectMessages(selectedMessages.filter(function (x) x.messageId != msgHdr.messageId));
          });
        register(".action.mark-read", function markreadnode_listener (event) {
            GCV.msgHdrsMarkAsRead([msgHdr], !msgHdr.isRead);
          });

        /* Now the expand collapse and stuff */
        register(".grip", GCV.stash.collapse_all[iCopy]);
        register(null, function dblclick_listener () {
            if (msgNode.classList.contains("collapsed"))
              GCV.stash.expand_all[iCopy]();
            else
              GCV.stash.collapse_all[iCopy]();
          }, "dblclick");
        register(".snippetmsg", GCV.stash.expand_all[iCopy]);
        let isAccel = function (event)
          (navigator.platform.indexOf("mac") === 0 && event.metaKey
            || event.ctrlKey);
        msgNode.addEventListener("keypress", function keypress_listener (event) {
            switch (event.which) {
              case 'o'.charCodeAt(0):
              case 13:
                if (msgNode.classList.contains("collapsed")) {
                  /* Although iframe expansion preserves scroll value, we must do
                   * that *after* the iframe has been expanded, otherwise, the
                   * viewport might be too short and won't allow scrolling to the
                   * right value already. */
                  runOnceAfterNSignals(1, function () scrollNodeIntoView(msgNode));
                  GCV.stash.expand_all[iCopy]();
                } else {
                  GCV.stash.collapse_all[iCopy]();
                }
                break;

              case 'h'.charCodeAt(0):
                msgNode.style.display = "none";
                break;

              case 'n'.charCodeAt(0):
                if (msgNode.nextElementSibling)
                  msgNode.nextElementSibling.focus();
                event.preventDefault();
                break;

              case 'p'.charCodeAt(0):
                let prev = msgNode.previousElementSibling;
                if (prev) {
                  prev.focus();
                  /* This is why this works better than shift-tab. We make sure
                   * the message is not hidden by the header! */
                  if (htmlpane.contentDocument.documentElement.scrollTop > prev.offsetTop - 5)
                    htmlpane.contentWindow.scrollTo(0, prev.offsetTop - 5);
                }
                event.preventDefault();
                break;
            
              case 'r'.charCodeAt(0):
                if (isAccel(event)) {
                  compose(Ci.nsIMsgCompType.ReplyToSender, event);
                  event.preventDefault();
                }
                break;

              case 'R'.charCodeAt(0):
                if (isAccel(event)) {
                  compose(Ci.nsIMsgCompType.ReplyAll, event);
                  event.preventDefault();
                }
                break;

              case 'l'.charCodeAt(0):
                if (isAccel(event)) {
                  forward(event);
                  event.preventDefault();
                }
                break;

              case 'a'.charCodeAt(0):
                GCV.archive_all();
                break;

              case 'u'.charCodeAt(0):
                SetFocusThreadPane(event);
                break;

              case '#'.charCodeAt(0):
                GCV.delete_all();
                break;
            }
          }, true);


        /* The HTML is heavily processed to detect extra quoted parts using
         * different heuristics, the "- show/hide quoted text -" links are
         * added. */
        let originalScroll; /* This is shared by the nested event listeners below */

        let iframe = htmlpane.contentDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "iframe");
        /* Big hack to workaround bug 540911 */
        iframe.setAttribute("transparent", "transparent");
        iframe.setAttribute("style", "height: 20px");
        iframe.setAttribute("type", "content");
        /* The xul:iframe automatically loads about:blank when it is added
         * into the tree. We need to wait for the document to be loaded before
         * doing things.
         *
         * Why do we do that? Basically because we want the <xul:iframe> to
         * have a docShell and a webNavigation. If we don't do that, and we
         * set directly src="about:blank" above, sometimes we are too fast and
         * the docShell isn't ready by the time we get there. */
        iframe.addEventListener("load", function f_temp2(event, aCharset) {
            iframe.removeEventListener("load", f_temp2, true);

            /* The second load event is triggered by loadURI with the URL
             * being the necko URL to the given message. */
            iframe.addEventListener("load", function f_temp1(event) {
                iframe.removeEventListener("load", f_temp1, true);
                let iframeDoc = iframe.contentDocument;

                /* Do some reformatting + deal with people who have bad taste */
                iframeDoc.body.setAttribute("style", "padding: 0; margin: 0; "+
                  "color: black; background-color: white; "+
                  "-moz-user-focus: none !important; ");

                /* Our super-advanced heuristic ;-) */
                let hasHtml = !(
                  iframeDoc.body.firstElementChild &&
                  (iframeDoc.body.firstElementChild.classList.contains("moz-text-flowed") ||
                   iframeDoc.body.firstElementChild.classList.contains("moz-text-plain")));

                /* Remove the attachments if the user has not set View >
                 * Display Attachments Inline. Do that right now, otherwise the
                 * quoted text detection will mess up the markup. */
                let fieldsets = iframeDoc.getElementsByClassName("mimeAttachmentHeader");
                for (let i = fieldsets.length - 1; i >= 0; i--) {
                  myDump("Found an attachment, removing... please uncheck View > Display attachments inline.\n");
                  let node = fieldsets[i];
                  while (node.nextSibling)
                    node.parentNode.removeChild(node.nextSibling);
                  node.parentNode.removeChild(node);
                }

                /* The part below is all about quoting */
                /* Launch various heuristics to convert most common quoting styles
                 * to real blockquotes. Spoiler: most of them suck. */
                GCV.convertOutlookQuotingToBlockquote(iframe.contentWindow, iframeDoc);
                GCV.convertHotmailQuotingToBlockquote1(iframeDoc);
                GCV.convertHotmailQuotingToBlockquote2(iframe.contentWindow, iframeDoc, gPrefs["hide_quote_length"]);
                GCV.convertForwardedToBlockquote(iframeDoc);
                GCV.fusionBlockquotes(iframeDoc);
                /* This function adds a show/hide quoted text link to every topmost
                 * blockquote. Nested blockquotes are not taken into account. */
                let walk = function walk_ (elt) {
                  for (let i = elt.childNodes.length - 1; i >= 0; --i) {
                    let c = elt.childNodes[i];
                    /* GMail uses class="gmail_quote", other MUA use type="cite"...
                     * so just search for a regular blockquote */
                    if (c.tagName && c.tagName.toLowerCase() == "blockquote") {
                      if (c.getUserData("hideme") !== false) { /* null is ok, true is ok too */
                        /* Compute the approximate number of lines while the element is still visible */
                        let style = iframe.contentWindow.getComputedStyle(c, null);
                        if (style) {
                          let numLines = parseInt(style.height) / parseInt(style.lineHeight);
                          if (numLines > gPrefs["hide_quote_length"]) {
                            let div = iframeDoc.createElement("div");
                            div.setAttribute("class", "link showhidequote");
                            div.addEventListener("click", function div_listener (event) {
                                let h = htmlpane.contentWindow.toggleQuote(event);
                                iframe.style.height = (parseFloat(iframe.style.height) + h)+"px";
                              }, true);
                            div.setAttribute("style", "color: #06d; cursor: pointer; font-size: 90%;");
                            div.appendChild(document.createTextNode("- "+
                              stringBundle.getString("showquotedtext")+" -"));
                            elt.insertBefore(div, c);
                            c.style.display = "none";
                          }
                        }
                      }
                    } else {
                      walk(c);
                    }
                  }
                };
                walk(iframeDoc);

                /* Ugly hack (once again) to get the style inside the
                 * <iframe>. I don't think we can use a chrome:// url for
                 * the stylesheet because the iframe has a type="content" */
                let style = iframeDoc.createElement("style");
                let defaultFont = gPrefBranch.getCharPref("font.default");
                style.appendChild(iframeDoc.createTextNode(
                  ".pre-as-regular {\n"+
                  "  font-family: "+defaultFont+" !important;\n"+
                  "  font-size: medium !important;\n"+
                  "}\n"+
                  "fieldset.mimeAttachmentHeader,\n"+
                  "fieldset.mimeAttachmentHeader + *,\n"+
                  "fieldset.mimeAttachmentHeader + * + *,\n"+
                  "fieldset.mimeAttachmentHeader + * + * + *,\n"+
                  "fieldset.mimeAttachmentHeader + * + * + * + * {\n"+
                  "  display: none;\n"+
                  "}\n"
                  ));
                iframeDoc.body.previousElementSibling.appendChild(style);

                /* Hello, Enigmail. Do that now, because decrypting a message
                 * will change its height. If you've got nothing better to do,
                 * test for the remaining 4572 possible statuses. */
                if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
                  let status = tryEnigmail(iframeDoc.body);
                  if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
                    msgNode.getElementsByClassName("enigmail-enc-ok")[0].style.display = "";
                  if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
                    msgNode.getElementsByClassName("enigmail-sign-ok")[0].style.display = "";
                  if (status & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE)
                    msgNode.getElementsByClassName("enigmail-sign-unknown")[0].style.display = "";
                }

                /* Add an event listener for the button that toggles the style of the
                 * font. Only if we seem to be able to implement it (i.e. we
                 * see a <pre>). */
                if (!hasHtml) {
                  let toggleFontStyle = function togglefont_listener (event) {
                    let elts = iframeDoc.querySelectorAll("pre, body > *:first-child")
                    for each (let [, elt] in Iterator(elts)) {
                      elt.classList.toggle("pre-as-regular");
                    }
                    /* XXX The height of the iframe isn't updated as we change
                     * fonts. This is usually unimportant, as it will grow
                     * once if the initial font was smaller, and then remain
                     * high. XXX check if offsetHeight works better with Gecko
                     * 1.9.2 */
                    iframe.style.height = iframeDoc.body.scrollHeight+"px";
                  };
                  /* By default, plain/text messages are displayed using a
                   * monospaced font. */
                  if (!gPrefs["monospaced"] && !(gPrefs["monospaced_senders"].indexOf(authorEmail(msgHdr)) >= 0))
                    toggleFontStyle();
                  toggleFontNode.addEventListener("click", toggleFontStyle, true);
                  /* Show the small icon */
                  toggleFontNode.style.display = "";
                }

                /* For bidiUI. Do that now because the DOM manipulations are
                 * over. We can't do this before because BidiUI screws up the
                 * DOM. Don't know why :(. */
                if (typeof(BDMActionPhase_htmlNumericEntitiesDecoding) == "function") {
                  try {
                    let domDocument = iframe.docShell.contentViewer.DOMDocument;
                    let body = domDocument.body;

                    let BDMCharsetPhaseParams = {
                      body: body,
                      charsetOverrideInEffect: msgWindow.charsetOverride,
                      currentCharset: msgWindow.mailCharacterSet,
                      needCharsetForcing: false,
                      charsetToForce: null
                    };
                    BDMActionPhase_charsetMisdetectionCorrection(BDMCharsetPhaseParams);
                    if (BDMCharsetPhaseParams.needCharsetForcing
                        && BDMCharsetPhaseParams.charsetToForce != aCharset) {
                      //XXX this doesn't take into account the case where we
                      //have a cycle with length > 0 in the reloadings.
                      //Currently, I only see UTF8 -> UTF8 cycles.
                      myDump("Reloading with "+BDMCharsetPhaseParams.charsetToForce+"\n");
                      f_temp2(null, BDMCharsetPhaseParams.charsetToForce);
                      return;
                    }
                    BDMActionPhase_htmlNumericEntitiesDecoding(body);
                    BDMActionPhase_quoteBarsCSSFix(domDocument);
                    BDMActionPhase_directionAutodetection(body);
                  } catch (e) {
                    myDump(e);
                    throw e;
                  }
                }

                /* Everything's done, so now we're able to settle for a height. */
                iframe.style.height = iframeDoc.body.scrollHeight+"px";

                /* Attach the required event handlers so that links open in the
                 * external browser */
                for each (let [, a] in Iterator(iframeDoc.getElementsByTagName("a"))) {
                  a.addEventListener("click", function link_listener (event) specialTabs.siteClickHandler(event, /^mailto:/), true);
                }

                /* Sometimes setting the iframe's content and height changes
                 * the scroll value, don't know why. */
                if (originalScroll)
                  htmlpane.contentDocument.documentElement.scrollTop = originalScroll;

                /* jQuery, go! */
                htmlpane.contentWindow.styleMsgNode(msgNode);

                signal();
              }, true); /* end document.addEventListener */

            /* Unbelievable as it may seem, the code below works.
             * Some references :
             * - http://mxr.mozilla.org/comm-central/source/mailnews/base/src/nsMessenger.cpp#564
             * - http://mxr.mozilla.org/comm-central/source/mailnews/base/src/nsMessenger.cpp#388
             * - https://developer.mozilla.org/@api/deki/files/3579/=MessageRepresentations.png
             *
             * According to dmose, we should get the regular content policy
             * for free (regarding image loading, JS...) by using a content
             * iframe with a classical call to loadURI. AFAICT, this works
             * pretty well (no JS is executed, the images are loaded IFF we
             * authorized that recipient).
             * */
            let url = GCV.msgHdrToNeckoURL(msgHdr, gMessenger);

            /* These steps are mandatory. Basically, the code that loads the
             * messages will always output UTF-8 as the OUTPUT ENCODING, so
             * we need to tell the iframe's docshell about it. */
            let cv = iframe.docShell.contentViewer;
            cv.QueryInterface(Ci.nsIMarkupDocumentViewer);
            cv.hintCharacterSet = "UTF-8";
            cv.hintCharacterSetSource = kCharsetFromMetaTag;
            /* Is this even remotely useful? */
            iframe.docShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;

            /* Now that's about the input encoding. Here's the catch: the
             * right way to do that would be to query nsIMsgI18NUrl [1] on the
             * nsIURI and set charsetOverRide on it. For this parameter to
             * take effect, we would have to pass the nsIURI to LoadURI, not a
             * string as in url.spec, but a real nsIURI. Next step:
             * nsIWebNavigation.loadURI only takes a string... so let's have a
             * look at nsIDocShell... good, loadURI takes a a nsIURI there.
             * BUT IT'S [noscript]!!! I'm doomed.
             *
             * Workaround: call DisplayMessage that in turns calls the
             * docShell from C++ code. Oh and why are we doing this? Oh, yes,
             * see [2].
             *
             * Some remarks: I don't know if the nsIUrlListener [3] is useful,
             * but let's leave it like that, it might come in handy later. And
             * we're we _cannot instanciate directly_ because there are
             * different ones for each type of account. So we must ask
             * nsIMessenger for it, so that it instanciates the right
             * component.
             *
            [1] http://mxr.mozilla.org/comm-central/source/mailnews/base/public/nsIMsgMailNewsUrl.idl#172
            [2] https://www.mozdev.org/bugs/show_bug.cgi?id=22775
            [3] http://mxr.mozilla.org/comm-central/source/mailnews/base/public/nsIUrlListener.idl#48
            [4] http://mxr.mozilla.org/comm-central/source/mailnews/base/public/nsIMsgMessageService.idl#112
            */
            let messageService = gMessenger.messageServiceFromURI(url.spec);
            let urlListener = {
              OnStartRunningUrl: function () {},
              OnStopRunningUrl: function () {},
              QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIUrlListener])
            };
            let uri = msgHdr.folder.getUriForMsg(msgHdr);
            /**
            * When you want a message displayed....
            *
            * @param in aMessageURI Is a uri representing the message to display.
            * @param in aDisplayConsumer Is (for now) an nsIDocShell which we'll use to load 
            *                         the message into.
            *                         XXXbz Should it be an nsIWebNavigation or something?
            * @param in aMsgWindow
            * @param in aUrlListener
            * @param in aCharsetOverride (optional) character set over ride to force the message to use.
            * @param out aURL
            */
            messageService.DisplayMessage(uri,
                                          iframe.docShell,
                                          msgWindow,
                                          urlListener,
                                          aCharset,
                                          {});

          }, true); /* end document.addEventListener */

        /* The height information that allows us to perform auto-resize is
         * only available if the iframe has been displayed at least once.
         * Here, we start with the iframe hidden, so there's no way we can
         * perform styling, auto-resizing, etc. right now. We need to wait
         * for the iframe to be loaded first. To simplify things, the whole
         * process of adding the iframe into the tree and styling it will be
         * done when it is made visible for the first time. That is, when we
         * toggle the message for the first time. */
        let firstRun = true;
        expandIframe = function expandIframe_ () {
          if (firstRun) {
            originalScroll = htmlpane.contentDocument.documentElement.scrollTop;
            htmlMsgNode.appendChild(iframe); /* Triggers the signal at the end */
            firstRun = false;
          } else {
            signal();
          }
        };

        /* This part is the fallback version of the try-block below in case:
         * - there's no gloda message associated
         * - there's a newsgroup message which DOES trigger a call to
         *   MsgHdrToMimeMessage but DOES NOT have any relevant information in
         *   it (yay!)
         * */
        let fallbackNoGloda = function () {
          try {
            // Offline messages generate exceptions, which is unfortunate.  When
            // that's fixed, this code should adapt. XXX
            /* --> Try to deal with that. Try to come up with something that
             * remotely looks like a snippet. Don't link attachments, do
             * nothing, I won't duplicate the gloda code here, let's stay sane.
             * */
            myDump("*** Got an \"offline message\"\n");

            let body = GCV.messageBodyFromMsgHdr(msgHdr, true);
            let snippet = body.substring(0, SNIPPET_LENGTH-1)+"…";
            snippetMsgNode.textContent = snippet;
          } catch (e) {
            Application.console.log("GCV: Error fetching the message: "+e);
            /* Ok, that failed too... I'm out of ideas! */
            htmlMsgNode.textContent = "...";
            if (!snippetMsgNode.textContent)
              snippetMsgNode.textContent = "...";
          }
          signal();
        };

        /* This part of the code fills various information regarding the message
         * (attachments, header details, sender, snippet...) through Gloda. */
        try {
          MsgHdrToMimeMessage(msgHdr, null, function MsgHdrToMimeMessageCallback_ (aMsgHdr, aMimeMsg) {
            /* Yes it happens with newsgroup messages */
            if (aMimeMsg == null) { // shouldn't happen, but sometimes does?
              fallbackNoGloda();
              return;
            }

            /* Fill the extended headers */
            let tooltip = msgNode.getElementsByClassName("fg-tooltip")[0];
            tooltip.removeChild(tooltip.getElementsByClassName("remove-me")[0]);
            let folderStr = msgHdr.folder.prettiestName;
            let folder = msgHdr.folder;
            while (folder.parent) {
              folder = folder.parent;
              folderStr = folder.name + "/" + folderStr;
            }
            aMimeMsg.headers["folder"] = folderStr;
            for each (let [, header] in Iterator(["folder", "from", "sender", "subject", "reply-to",
                  "to", "cc", "bcc", "mailed-by", "x-mailer", "mailer", "user-agent", "date"])) {
              if (aMimeMsg.headers[header] && String.trim(aMimeMsg.headers[header]).length > 0) {
                let span = htmlpane.contentDocument.createElement("span");
                let headerNode = htmlpane.contentDocument.createElement("b");
                if (header == "folder")
                  headerNode.textContent = stringBundle.getString("folder")+": ";
                else
                  headerNode.textContent = header+": ";
                let value = aMimeMsg.headers[header];
                if (header != "folder")
                  value = GCV.GlodaUtils.deMime(value); /* I <3 gloda */
                let valueNode = htmlpane.contentDocument.createTextNode(value);
                tooltip.appendChild(headerNode);
                tooltip.appendChild(valueNode);
                tooltip.appendChild(htmlpane.contentDocument.createElement("br"));
              }
            }
            /* Remove trailing <br /> */
            tooltip.removeChild(tooltip.children[tooltip.children.length - 1]);
            /* Move back the view-source link at the end */
            tooltip.appendChild(tooltip.getElementsByClassName("view-source")[0]);


            /* Make a guess at the sender */
            if (aMimeMsg.headers["x-bugzilla-who"]) {
              let senderSpans = processEmails(aMimeMsg.headers["x-bugzilla-who"], true, htmlpane.contentDocument);
              if (senderSpans.length) {
                senderNode.removeChild(senderNode.firstChild);
                senderNode.appendChild(senderSpans[0]);
              }
            }

            /* The advantage here is that the snippet is properly stripped of
             * quoted text */
            let [snippet, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, SNIPPET_LENGTH);
            let [plainTextBody, ] = mimeMsgToContentAndMeta(aMimeMsg, aMsgHdr.folder);

            plainTextMsgNode.textContent = plainTextBody.getContentString();
            snippetMsgNode.textContent = snippet;

            /* Ok, let's have fun with attachments now */
            let attachments = GCV.MimeMessageGetAttachments(aMimeMsg);
            let [makePlural, ] = GCV.PluralForm.makeGetter(stringBundle.getString("plural_rule"));
            let attachmentsTopTxt = stringBundle.getString("attachments_top2");
            let attachmentsBottomTxt = stringBundle.getString("attachments_bottom2");
            let numAttachments = attachments.length;
            if (attachments.length > 0) {
              /* That's for the small paperclip icon */
              let attachmentNode = msgNode.getElementsByClassName("attachment")[0];
              let attachmentsTxt = makePlural(numAttachments, attachmentsTopTxt).replace("#1", numAttachments);
              attachmentNode.style.display = "";
              attachmentNode.setAttribute("title",
                attachmentsTxt + ": " +
                attachments.map(function (x) x.name).join(", "));

              /* That's for the small list of attachments below the sender */
              let areaNode = msgNode.getElementsByClassName("attachments-area")[0];
              areaNode.textContent = attachmentsTxt;
              let ul = htmlpane.contentDocument.createElement("ul");
              for each (let [k, att] in Iterator(attachments)) {
                let li = htmlpane.contentDocument.createElement("li");
                let a = htmlpane.contentDocument.createElement("span");
                a.classList.add("link");
                a.textContent = att.name;
                let j = k;
                a.addEventListener("click", function () {
                  myDump("Asking for att"+j+"\n");
                  scrollNodeIntoView(msgNode.getElementsByClassName("att"+j)[0]);
                }, true);
                li.appendChild(a);
                ul.appendChild(li);
              }
              areaNode.appendChild(ul);

              /* That's for the boxes below the message body that contain a
               * description for each attachment */
              let displayFullAttachments = function () {
                let saveTxt = stringBundle.getString("attachment_save");
                let saveAllTxt = stringBundle.getString("attachment_saveall");
                /* Create a box at the bottom for attachments */
                let attachmentsBox =
                  <div class="attachments-box">
                    <hr />
                    <div class="attachment-actions-box">
                      <span class="attachments-summary" />
                      <button class="link fg-button ui-state-default ui-corner-all save-all">{saveAllTxt}</button>
                    </div>
                  </div>;
                msgNode.getElementsByClassName("attachments-box-handler")[0].innerHTML =
                  attachmentsBox.toXMLString();
                let attBoxNode = msgNode.getElementsByClassName("attachments-box")[0];
                attBoxNode.getElementsByClassName("attachments-summary")[0].textContent =
                  makePlural(numAttachments, attachmentsBottomTxt).replace("#1", attachments.length);

                let theAttachments = [];
                for each (let [j, att] in Iterator(attachments)) {
                  /* Gather a lot of information about that attachment */
                  let neckoURL = ioService.newURI(att.url, null, null);
                  /* I'm still surprised that this magically works */
                  neckoURL.QueryInterface(Ci.nsIMsgMessageUrl);
                  let uri = neckoURL.uri;
                  let contentType = att.contentType;

                  /* Keep track of all the given attachments to a single message */
                  let attInfo = new createNewAttachmentInfo(
                    att.contentType, att.url, att.name, uri, att.isExternal
                    );
                  theAttachments.push(attInfo);

                  let singleBox = htmlpane.contentDocument.createElement("div");
                  /* See
                   * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#1993
                   * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.xul#76
                   * for the relevant actions */
                  let altTxt = stringBundle.getString("open_att_tab2").replace("#1", att.name);
                  let altTxt2 = stringBundle.getString("open_attachment2").replace("#1", att.name);
                  if (att.contentType.indexOf("image/") === 0) {
                    singleBoxContents =
                      <div class="attachment-box image-attachment-box">
                        <table><tbody><tr>
                        <td><img title={altTxt} src={att.url} /></td>
                        <td>
                          <p><span class="attachment-link link" title={altTxt2}>{att.name}</span></p>
                          <p>{contentType}</p>
                          <p>
                            <button class="link fg-button ui-state-default ui-corner-all save">{saveTxt}</button>
                          </p>
                        </td>
                        </tr></tbody></table>
                      </div>;
                  } else {
                    let imgSrc = "moz-icon://" + att.displayName + "?size=" + 32 + "&contentType=" + att.contentType;
                    singleBoxContents =
                      <div class="attachment-box">
                        <table><tbody><tr>
                        <td><img title={altTxt} src={imgSrc} /></td>
                        <td>
                          <p><span class="attachment-link link" title={altTxt2}>{att.name}</span></p>
                          <p>{contentType}</p>
                          <p>
                            <button class="link fg-button ui-state-default ui-corner-all save">{saveTxt}</button>
                          </p>
                        </td>
                        </tr></tbody></table>
                      </div>;
                  }
                  singleBox.innerHTML = singleBoxContents.toXMLString();
                  attBoxNode.appendChild(singleBox);
                  singleBox.classList.add("att"+j);
                  singleBox.getElementsByClassName("attachment-link")[0].addEventListener("click",
                    function (event) {
                      HandleMultipleAttachments([attInfo], "open");
                    }, true);
                  singleBox.getElementsByClassName("save")[0].addEventListener("click",
                    function (event) {
                      HandleMultipleAttachments([attInfo], "save");
                    }, true);
                  /* We should be able to display those in a tab... except, try
                   * sending yourself a .ml file for instance. Detected as
                   * text/plain, displayed inline with the regular message code.
                   * Try to open it, you get "This file has type
                   * application/ocaml" or whatever. WTF? */
                  if (att.contentType.indexOf("image/") === 0 || att.contentType.indexOf("text/") === 0) {
                    /* Display the cursor pointer */
                    singleBox.getElementsByTagName("img")[0]
                      .classList.add("image-attachment-preview");
                    /* Add the event listener */
                    let url = att.url;
                    singleBox.getElementsByTagName("img")[0].addEventListener("click",
                      function (event) {
                        /* Of course that will leave us with a blank tab in the
                         * case of a .ml file */
                        Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator).
                        getMostRecentWindow("mail:3pane").
                        document.getElementById("tabmail").openTab(
                          "contentTab",
                          { contentPage: url });
                      }, true);
                  } else { /* Actually we don't want the "Open [file.txt]" */
                    singleBox.getElementsByTagName("img")[0].setAttribute("title", "");
                  }
                } // end for each (attachment)
                /* Save all attachments. We can do that now since we have a
                 * pointer towards all the attachments. */
                attBoxNode.getElementsByClassName("save-all")[0].addEventListener("click",
                  function (event) {
                    HandleMultipleAttachments(theAttachments, "save");
                  }, true);
              }; /* end displayFullAttachments () */
              /* Since this triggers a lot of downloads, we have to be lazy
               * about it, so do it only when necessary. We're filling a forward
               * reference here. */
              myDump("Registering expandAttachments "+iCopy+"\n");
              expandAttachments = displayFullAttachments;
            } /* end if (attachments.length > 0) */

            signal();
          }); /* end MsgHdrToMimeMessageCallback_ */
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          /* If we don't do that, we slow down the conversation fillup process
           * terribly, which means that we're still iterating through messages
           * by the time we have changed conversations, which means messages
           * snippets keep arriving from the previous conversation. Long story
           * short: it's bad. */
          setTimeout(fallbackNoGloda, 0);
        }

        let stdReader = msgNode.getElementsByClassName("std-reader")[0];
        stdReader.msgHdr = msgHdr;
        stdReader.folder = msgHdr.folder;
        stdReader.msgKey = msgHdr.messageKey;
        stdReader.addEventListener("click", function(e) {
          /* Cancel the next attempt to load a conversation, we explicitely
           * requested this message. */
          let url = GCV.msgHdrToNeckoURL(msgHdr, gMessenger);
          GCV.stash.wantedUrl = url.spec;

          /* msgHdr is "the right message" so jump to it (see
           * selectRightMessage) */
          let viewIndex = gFolderDisplay.view.getViewIndexForMsgHdr(this.msgHdr);
          if (viewIndex != nsMsgViewIndex_None) {
            gFolderDisplay.selectMessage(this.msgHdr);
            return;
          }

          /* selectFolder doesn't work sometimes, issue fixed in Lanikai as of 2010-01-05, see bug 536042 */
          gFolderTreeView.selectFolder(this.folder, true);
          gFolderDisplay.selectMessage(this.msgHdr);
        }, true);
      }

      this.notifyMaxCountExceeded(htmlpane.contentDocument, numMessages, MAX_THREADS);

      this.computeSize(htmlpane);
      htmlpane.contentDocument.defaultView.adjustHeadingSize();
      myDump("--- End ThreadSummary::summarize\n\n");
    }
  };

  /* This function is the core search function. It pulls a GMail-like
   * conversation from messages aSelectedMessages, then calls k when the
   * messages have all been found. If it fails to retrieve GlodaMessages, it
   * calls k(null, [list of msgHdrs]). */
  function pullConversation(aSelectedMessages, k) {
    /* Let's hope the user hasn't changed selection by the time we get there...
     * this should minimize race conditions but not solve them. */
    let firstMessageId = gFolderDisplay.selectedMessage.messageId;
    try {
      GCV.stash.q1 = Gloda.getMessageCollectionForHeaders(aSelectedMessages, {
        onItemsAdded: function (aItems) {
          if (!aItems.length) {
            myDump("!!! GConversation: gloda query returned no messages!\n");
            k(null, aSelectedMessages, aSelectedMessages[0]);
            return;
          }
          let msg = aItems[0];
          GCV.stash.q2 = msg.conversation.getMessagesCollection({
            onItemsAdded: function (aItems) {
            },
            onItemsModified: function () {},
            onItemsRemoved: function () {},
            /* That's a XPConnect bug. bug 547088, so track the
             * bug and remove the setTimeout when it's fixed and bump the
             * version requirements in install.rdf.template */
            onQueryCompleted: function pullConversationOnQueryCompleted_ (aCollection)
              setTimeout(function pullConversationInternalCallback2_ ()
                (gFolderDisplay.selectedMessage
                 && gFolderDisplay.selectedMessage.messageId == firstMessageId)
                  ? k(aCollection, aCollection.items, msg)
                  : myDump("Canceled because we changed conversations too fast\n"),
                0),
          }, true);
        },
        onItemsModified: function () {},
        onItemsRemoved: function () {},
        onQueryCompleted: function (aCollection) { },
      }, true);
    } catch (e) {
      myDump("Exception in summarizeThread" + e + "\n");
      logException(e);
      Components.utils.reportError(e);
      throw(e);
    }
  }

  /* The first parameter is usually what we've retrieved from the Gloda query.
   * However, some of the selected messages might not have been indexed yet, so
   * add them here. */
  function addPossiblyMissingHeaders(items, aSelectedMessages) {
    let oldLength = items.length;
    let seen = {};
    for each (let [, item] in Iterator(items))
      seen[item.messageId] = true;
    for each (let [, item] in Iterator(aSelectedMessages)) {
      if (!seen[item.messageId]) {
        items.push(item);
        seen[item.messageId] = true;
      }
    }
    if (items.length != oldLength) {
      items.sort(function (a, b) a.date - b.date);
    }
  }

  /* What we do here is basically compare the new set of message headers to the
   * one we used last time to build the conversation view. If the message set is
   * the same, it is useless to rebuild exactly the same conversation. This is
   * sometimes mandatory not to rebuild it (rebuilding a conversation that has
   * two unread messages in a row marks them read the first time and only
   * expands the last one on the second load, thus hiding an unread message).
   * */
  function isNewConversation(items) {
    /* Happens in wicked cases */
    if (GCV.stash.multiple_selection || !GCV.stash.all_went_well)
      return true;
    let newConversation = false;
    try {
      for (let i = 0; i < Math.max(items.length, GCV.stash.msgHdrs.length); ++i) {
        if (i >= items.length || i >= GCV.stash.msgHdrs.length ||
            items[i].messageId != GCV.stash.msgHdrs[i].messageId) {
          newConversation = true;
          break;
        }
      }
      return newConversation;
    } catch (e if e.result == Components.results.NS_ERROR_INVALID_POINTER) {
      /* This is bug 520115 hitting us */
      return true;
    }
  }

  /* Actually it's more tricky than it seems because of the "focus currently
   * selected message" option. It has the wicked side effect that:
   * - we when reload the exact same conversation, maybe we want to focus a
   *   different node
   * - maybe we have a leftover "focus-me-first" node from a previously selected
   *   message that triggered the conversation. This node has .selected AND
   *   tabindex=1. */
  function restorePreviousConversation() {
    /* This can happen if we open a conversation in a new tab, focus message A,
     * close the tab, and leave focus in the conversation area when switching
     * back to the 3-pane view, and message B should be focused. */
    let badMsg = htmlpane.contentDocument.activeElement;
    if (badMsg && badMsg.classList.contains("message")) {
      myDump("Found leftover focus\n");
      badMsg.blur();
    }

    /* Remove all previous focus-me-first hooks */
    let badMsgs = htmlpane.contentDocument
      .querySelectorAll(".message.selected, .message[tabindex=\"1\"]");
    if (badMsgs.length > 1)
      myDump("!!! SEVERE MISTAKE JONATHAN LOOK INTO THIS RIGHT NOW\n");
    for each (let [, msgNode] in Iterator(badMsgs)) {
      msgNode.classList.remove("selected");
      if (msgNode.previousElementSibling)
        msgNode.setAttribute("tabindex",
          parseInt(msgNode.previousElementSibling.getAttribute("tabindex"))+1);
      else /* It's the first one in the list */
        msgNode.setAttribute("tabindex", 2);
    }

    let needsFocus = tellMeWhoToFocus(GCV.stash.msgHdrs);

    runOnceAfterNSignals(
      GCV.stash.msgHdrs.length,
      function f_temp5() {
        let msgNode = msgHdrToMsgNode(GCV.stash.msgHdrs[needsFocus]);
        scrollNodeIntoView(msgNode);
        variousFocusHacks(msgNode);
      }
    );

    let actionList = tellMeWhoToExpand(GCV.stash.msgHdrs, needsFocus);
    for each (let [i, action] in Iterator(actionList)) {
      switch (action) {
        case kActionDoNothing:
          signal();
          break;
        case kActionCollapse:
          GCV.stash.collapse_all[i]();
          break;
        case kActionExpand:
          GCV.stash.expand_all[i]();
          break;
        default:
          throw "Never happens";
          break;
      }
    }
  }

  /* The summarizeThread function overwrites the default one, searches for more
   * messages, and passes them to our instance of ThreadSummary. This design is
   * more convenient as it follows Thunderbird's more closely, which allows me
   * to track changes to the ThreadSummary code in Thunderbird more easily. */
  summarizeThread = function(aSelectedMessages, aListener) {
    if (aSelectedMessages.length == 0)
      return false;

    /* First thing to do: we've been called again, so don't try to mark the
     * previous conversation as read, we've switched too fast. Of course, the
     * timeout might have been exceeded already, which means this call does
     * nothing. */
    clearTimeout(GCV.mark_read_timeout);

    /* Various uninteresting stuff */
    htmlpane.contentWindow.enableExtraButtons();
    GCV.stash.multiple_selection = false;

    pullConversation(
      aSelectedMessages,
      function (aCollection, aItems, aMsg) {
        /* First-time info box. */
        if (!gPrefs["info_af_shown"])
          htmlpane.contentDocument.getElementById("info_af_box").style.display = "block";

        let items;
        let clearErrors = function () {
          for each (let [,e] in Iterator(htmlpane.contentDocument.getElementsByClassName("error")))
            e.style.display = "none";
        };

        /* Actual logic */
        if (aCollection) {
          clearErrors();
          items = [GCV.selectRightMessage(x, gDBView.msgFolder)
            for each ([, x] in Iterator(GCV.groupMessages(aCollection.items)))];
          items = items.filter(function (x) x);
          items = items.map(function (x) x.folderMessage);
          myDump("aCollection is non-null, "+items.length+" messages found\n");
          addPossiblyMissingHeaders(items, aSelectedMessages);
          myDump("Added missing headers, now "+items.length+" messages found\n");
        } else {
          /* Actually I'm pretty sure the else code path is never taken because
           * when the pref is set, the error message is hidden by the event
           * handler. So the next time a conversation is loaded, we don't need
           * to clear errors. */
          if (!gPrefs["disable_error_empty_collection"])
            htmlpane.contentWindow.errorEmptyCollection();
          /* else
            clearErrors(); */
          items = aItems;
          myDump("aCollection is null, "+items.length+" messages found\n");
          myDump("In aSelectedMessages, we have, "+aSelectedMessages.length+" messages\n");
        }

        if (isNewConversation(items)) {
          gSummary = new ThreadSummary(items, aListener);
          try {
            gSummary.init();
          } catch (e) {
            myDump(e+"\n");
            throw e;
          }
        } else {
          restorePreviousConversation();
        }

        return;
      }
    );
  };

  /* We must catch the call to summarizeMultipleSelection to hide the extra
   * buttons in multimessageview.xhtml that are for conversation view only */
  /* XXX figure out why I can't do let old = ... and then summarize... = old(); */
  summarizeMultipleSelection = function (aSelectedMessages) {
    if (aSelectedMessages.length == 0)
      return;
    try {
      /* Remove this when bug 538750 is fixed. And bump the version requirement
       * in install.rdf.template */
      /* -8<--- cut here --8<- */
      let threadKeys = [
        gDBView.getThreadContainingIndex(i).getChildHdrAt(0).messageKey
        for each ([, i] in Iterator(gFolderDisplay.selectedIndices))
      ];
      let isSameThread = threadKeys.every(function (x) x == threadKeys[0]);
      if (isSameThread) {
        summarizeThread(aSelectedMessages);
      } else {
      /* --8<-- end cut here -8<-- */
        gSummary = new MultiMessageSummary(aSelectedMessages);
        gSummary.init();
        document.getElementById('multimessage').contentWindow.disableExtraButtons();
        GCV.stash.multiple_selection = true;
      /* --8<-- cut here --8<- */
      }
      /* --8<-- end cut here -8<-- */
    } catch (e) {
      myDump("Exception in summarizeMultipleSelection" + e + "\n");
      Components.utils.reportError(e);
      throw(e);
    }
  };

  let checkGlodaEnabled = function() {
    let enabled = gPrefBranch.getBoolPref("mailnews.database.global.indexer.enabled");
    if (enabled) {
      return true;
    } else {
      gMessageDisplay.singleMessageDisplay = false;
      htmlpane.contentWindow.errorGlodaDisabled();
    }
  };

  /* Register event handlers through the global variable */
  GCV.on_load_thread = function() {
    if (!checkGlodaEnabled())
      return;
    summarizeThread(gFolderDisplay.selectedMessages, null, true);
    gMessageDisplay.singleMessageDisplay = false;
  };

  GCV.on_load_thread_tab = function(event) {
    if (!gFolderDisplay.selectedMessages.length)
      return;
    if (!checkGlodaEnabled())
      return;

    let aSelectedMessages = gFolderDisplay.selectedMessages;
    if (event.shiftKey) {
      let tabmail = document.getElementById("tabmail");
      tabmail.openTab("message", {msgHdr: aSelectedMessages[0], background: false});
      GCV.on_load_thread();
    } else {
      pullConversation(
        gFolderDisplay.selectedMessages,
        function (aCollection, aItems, aMsg) {
          let tabmail = document.getElementById("tabmail");
          if (aCollection) {
            aCollection.items = [GCV.selectRightMessage(m) for each ([, m] in Iterator(GCV.groupMessages(aCollection.items)))];
            aCollection.items = aCollection.items.filter(function (x) x);
            tabmail.openTab("glodaList", {
              collection: aCollection,
              message: aMsg,
              title: aMsg.subject,
              background: false
            });
          } else {
            gMessageDisplay.singleMessageDisplay = false;
            if (!gPrefs["disable_error_empty_collection"])
              htmlpane.contentWindow.errorEmptyCollection();
          }
        }
      );
    }
  };

  /* Register "print" functionnality. Now that's easy! */
  GCV.print = function () {
    document.getElementById("multimessage").contentWindow.print();
  };

  /* The button as well as the menu item are hidden and disabled respectively
   * when we're viewing a MultiMessageSummary, so fear not marking wrong
   * messages as read. */
  GCV.mark_all_read = function () {
    /* XXX optimize here and do a union beforehand */
    GCV.msgHdrsMarkAsRead(GCV.stash.msgHdrs, true);
    GCV.msgHdrsMarkAsRead(gFolderDisplay.selectedMessages, true);
  };

  GCV.archive_all = function () {
    if (GCV.stash.multiple_selection)
      MsgArchiveSelectedMessages(null);
    else
      GCV.msgHdrsArchive(GCV.stash.msgHdrs.concat(gFolderDisplay.selectedMessages), window);
  };

  GCV.delete_all = function () {
    if (GCV.stash.multiple_selection)
      GCV.msgHdrsDelete(gFolderDisplay.selectedMessages);
    else
      GCV.msgHdrsDelete(GCV.stash.msgHdrs.concat(gFolderDisplay.selectedMessages));
  };

  /* This actually does what we want. It also expands threads as needed. */
  GCV.on_back = function (event) {
    gMessageDisplay.singleMessageDisplay = true;
    gFolderDisplay.selectMessage(gFolderDisplay.selectedMessages[0]);
    document.getElementById("threadTree").focus();
  };

  GCV.on_expand_all = function (event) {
    for each (let [, f] in Iterator(GCV.stash.expand_all))
      f();
  };

  GCV.on_collapse_all = function (event) {
    for each (let [, f] in Iterator(GCV.stash.collapse_all))
      f();
  };

  /* We need to attach our custom context menu to multimessage, that's simpler
   * than using an overlay. */
  document.getElementById("multimessage").setAttribute("context", "gConvMenu");

  /* New method for always displaying the new UI. Beware, this is only modifying
   * the MessageDisplayWidget instance for the main window, but that's ok.
   * Besides, it has the nice side-effect that gloda search tabs do not fetch
   * the conversation view by default, which is imho nicer. */
  gMessageDisplay.onSelectedMessagesChanged = function () {
    try {
      if (!this.active)
        return true;
      ClearPendingReadTimer();

      let selectedCount = this.folderDisplay.selectedCount;
      myDump("*** Intercepted message load, "+selectedCount+" messages selected\n");

      if (selectedCount == 0) {
        this.clearDisplay();
        // Once in our lifetime is plenty.
        if (!this._haveDisplayedStartPage) {
          loadStartPage(false);
          this._haveDisplayedStartPage = true;
        }
        this.singleMessageDisplay = true;
        return true;

      } else if (selectedCount == 1) {
        /* Here starts the part where we modify the original code. */
        let msgHdr = this.folderDisplay.selectedMessage;
        let wantedUrl = GCV.stash.wantedUrl;
        GCV.stash.wantedUrl = null;

        /* We can't display NTTP messages and RSS messages properly yet, so
         * leave it up to the standard message reader. If the user explicitely
         * asked for the old message reader, we give up as well. */
        if (GCV.msgHdrIsRss(msgHdr) || GCV.msgHdrIsNntp(msgHdr)
            || wantedUrl == GCV.msgHdrToNeckoURL(msgHdr, gMessenger).spec
            || gPrefs["standard_single_message_view"]) {
          dump("Not displaying messages\n");
          GCV.msgHdrsMarkAsRead([msgHdr], true);
          this.singleMessageDisplay = true;
          return false;
        } else {
          /* Otherwise, we create a thread summary.
           * We don't want to call this._showSummary because it has a built-in check
           * for this.folderDisplay.selectedCount and returns immediately if
           * selectedCount == 1 */
          this.singleMessageDisplay = false;
          summarizeThread(this.folderDisplay.selectedMessages, this);
          return true;
        }
      }

      // Else defer to showSummary to work it out based on thread selection.
      return this._showSummary();
    } catch (e) {
      dump(e+"\n");
    }
  };
  myDump("*** gConversation loaded\n");
}, false);
