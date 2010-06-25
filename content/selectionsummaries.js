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
var gconversation = {
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
    collapse_all: []
  }
};

/* We use a function because of global namespace pollution. We use "onload"
 * because we need the <stringbundle> to be available. */
window.addEventListener("load", function f_temp0 () {
  window.removeEventListener("load", f_temp0, false); /* just to make sure */

  /* This one we use all the time, stop redefining it everywhere, just assume it
   * will be available anywhere from now on */
  let htmlpane = document.getElementById('multimessage');

  /* Better debug function */
  let dumpCallStack = function dumpCallStack_ () {
    let frame = Components.stack;
    while (frame) {
      dump(frame+"\n");
      frame = frame.caller;
    }
  }

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

  /* Classic */
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cu = Components.utils;
  const Cr = Components.results;
  Cu.import("resource://gconversation/VariousUtils.jsm");
  Cu.import("resource://gconversation/GlodaUtils.jsm");
  Cu.import("resource://gconversation/MsgHdrUtils.jsm");
  Cu.import("resource://gre/modules/PluralForm.jsm");
  Cu.import("resource:///modules/gloda/utils.js");

  /* For debugging purposes */
  let consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
  function myDump(aMsg) {
    dump(aMsg);
    if (false && consoleService)
      consoleService.logStringMessage("GCV: "+aMsg);
  };

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
  const i18nDateFormatter = Cc["@mozilla.org/intl/scriptabledateformat;1"].createInstance(Ci.nsIScriptableDateFormat);
  const stringBundle = document.getElementById("gconv-string-bundle");
  const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  const msgComposeService = Cc["@mozilla.org/messengercompose;1"].getService(Ci.nsIMsgComposeService);  

  /* How I wish Javascript had algebraic data types */
  const kActionDoNothing = 0;
  const kActionExpand = 1;
  const kActionCollapse = 2;

  /* Preferences are loaded once and then observed. For a new pref, add an entry
   * here + a case in the switch below. */
  let gPrefs = {};
  gPrefs["monospaced"] = prefs.getBoolPref("monospaced");
  gPrefs["monospaced_snippets"] = prefs.getBoolPref("monospaced_snippets");
  gPrefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
  gPrefs["fold_rule"] = prefs.getCharPref("fold_rule");
  gPrefs["focus_first"] = prefs.getBoolPref("focus_first");
  gPrefs["reverse_order"] = prefs.getBoolPref("reverse_order");
  gPrefs["auto_fetch"] = prefs.getBoolPref("auto_fetch");
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
      gconversation.stash.msgHdrs = [];
      switch (aData) {
        case "monospaced":
        case "monospaced_snippets":
        case "focus_first":
        case "reverse_order":
        case "auto_fetch":
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
  function getCard (email) {
    if (knownCards[email]) {
      return knownCards[email];
    } else {
      let cardDetails = getCardForEmail(email);
      knownCards[email] = cardDetails;
      return cardDetails;
    }
  }
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
      let address = {};
      address.emailAddress = addresses.value[i];
      address.fullAddress = fullNames.value[i];
      address.displayName = names.value[i];
      let cardDetails = getCard(address.emailAddress);
      if (gIdentities[address.emailAddress]) { /* OMG ITS ME */
        /* See
         * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#1130
         * for reference */
        address.displayName = isSender ? meTo : toMe;
      } else if (cardDetails.card) { /* We know the guy */
        //myDump("Got a card for "+address.emailAddress+"!\n");
        address.displayName = cardDetails.card.displayName;
        address.firstName = cardDetails.card.firstName;
      }
      decodedAddresses.push(address);
    }

    function colorize(card) {
      let name = card.displayName || card.emailAddress;
      let title = card.displayName ? card.emailAddress : "";

      let shortName = aDoc.createElement("span");
      shortName.textContent = gPrefs["guess_first_names"]
        ? card.firstName || parseShortName(name)
        : name;
      _mm_addClass(shortName, "short-name");

      let fullName = aDoc.createElement("span");
      fullName.textContent = name;
      _mm_addClass(fullName, "full-name");

      let span = aDoc.createElement("span");
      span.style.color = colorFor(card.emailAddress);
      span.appendChild(shortName);
      span.appendChild(fullName);
      span.setAttribute("title", title);
      return span;
    }
    return [colorize(a) for each ([, a] in Iterator(decodedAddresses))];
  }

  /* Create a closure that can be called later when all the messages have
   * been properly loaded, all the iframes resized to fit. When the page
   * won't scroll anymore, we manually set the message we want into view.
   *
   * This function is now also used by summarizeThread and the autoload event
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
    let tKey = aMsgHdr.messageKey + aMsgHdr.folder.URI;
    return gconversation.stash.msgNodes[tKey];
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
    _mm_addClass(aMsgNode, "selected");
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
        _mm_removeClass(msgNode, "selected");
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
      gconversation.stash.msgHdrs = this._msgHdrs;
      gconversation.stash.msgNodes = this._msgNodes;
      gconversation.stash.expand_all = [];
      gconversation.stash.collapse_all = [];

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
         + PluralForm.get(numMessages, gSelectionSummaryStrings["Nmessages"]).replace('#1', numMessages);
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
            });

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
                gconversation.stash.expand_all[i]();
                break;
              default:
                throw "Never happens";
                break;
            }
          }
        }
      );

      /* Now this is for every message. Note to self: all functions defined
       * inside the loop must be defined using let f = ... (otherwise the last
       * definition is always called !). Note to self: i is shared accross all
       * the loop executions. Note to self: don't rely on [this]. */
      for (let i = 0; i < numMessages; ++i) {
        let iCopy = i; /* Jonathan, we're not in OCaml, i is NOT immutable */

        myDump("*** Treating message "+i+"\n");
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }

        let msgHdr = this._msgHdrs[i];
        let key = msgHdr.messageKey + msgHdr.folder.URI;

        let msg_classes = "message collapsed";
        if (!msgHdr.isRead)
          msg_classes += " unread";
        if (msgHdr.isFlagged)
          msg_classes += " starred";

        let theSubject = msgHdr.mime2DecodedSubject;
        let dateObject = new Date(msgHdr.date/1000);
        let date;
        if (gPrefs["no_friendly_date"]) {
          let format = dateObject.toLocaleDateString("%x") == (new Date()).toLocaleDateString("%x")
            ? Ci.nsIScriptableDateFormat.dateFormatNone
            : Ci.nsIScriptableDateFormat.dateFormatShort;
          date = i18nDateFormatter.FormatDateTime("",
                                                  format,
                                                  Ci.nsIScriptableDateFormat.timeFormatNoSeconds,
                                                  dateObject.getFullYear(),
                                                  dateObject.getMonth() + 1,
                                                  dateObject.getDate(),
                                                  dateObject.getHours(),
                                                  dateObject.getMinutes(),
                                                  dateObject.getSeconds());
        } else {
          date = makeFriendlyDateAgo(dateObject);
        }

        /* The snippet class really has a counter-intuitive name but that allows
         * us to keep some style from the original multimessageview.css without
         * rewriting everything */
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
        let detailsTxt = stringBundle.getString("details");
        let toggleRead = stringBundle.getString("toggle_read2");
        let toggleFont = stringBundle.getString("toggle_font");
        let noGlodaTxt = stringBundle.getString("no_gloda");
        let enigEncOk = stringBundle.getString("enig_enc_ok");
        let enigSignOk = stringBundle.getString("enig_sign_ok");
        let enigSignUnknown = stringBundle.getString("enig_sign_unknown");
        let msgContents =
          <div class="row">
            <div class="pointer" />
            <div class="notification-icons">
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
                <div class="fg-tooltip fg-tooltip-right ui-widget ui-state-highlight ui-corner-all" style="display: none">
                  <span>{noGlodaTxt}</span>
                  <div class="fg-tooltip-pointer-up ui-state-highlight">
                    <div class="fg-tooltip-pointer-up-inner"></div>
                  </div>
                </div>
                <div class="tooltip msgheader-details-toggle">{detailsTxt}</div>
                <div class="msgheader-from-to">
                  <div class="sender link"></div>
                  <div class="to-text">{toTxt}</div>
                  <div class="recipients"></div>
                  <div class="draft-warning"></div>
                </div>
                <div class="msgheader-subject-date">
                  <div class="date">{date}</div>
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
        _mm_addClass(msgNode, msg_classes);

        /* That only changes the order in which the nodes are inserted, not the
         * index they have in this._msgHdrs */
        if (gPrefs["reverse_order"]) {
          messagesElt.insertBefore(msgNode, messagesElt.firstChild);
        } else {
          messagesElt.appendChild(msgNode);
        }

        /* We're using some forward references here. */
        let expandIframe = function () { dump("YOU SHOULD NOT SEE THIS\n"); };
        let expandAttachments = function () { dump("No attachments found ("+iCopy+")\n"); };
        let toggleMessage = function toggleMessage_ () {
          _mm_toggleClass(msgNode, "collapsed");
        };
        gconversation.stash.expand_all.push(function () {
          if (_mm_hasClass(msgNode, "collapsed")) {
            toggleMessage();
            expandAttachments();
            expandIframe(); /* takes care of calling signal() */
          }
        });
        gconversation.stash.collapse_all.push(function () {
          if (!_mm_hasClass(msgNode, "collapsed")) {
            toggleMessage(); /* Immediate */
            signal();
          }
        });

        /* Warn the user if this is a draft.
         * XXX we should probably provide a way to start editing said Draft */
        if (msgHdrIsDraft(msgHdr)) {
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
          _mm_addClass(tagNode, "tag " + tag.tag + " " + colorClass);
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
        for each (let [, span] in Iterator(recipientsSpans.concat(ccSpans))) {
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
          _mm_addClass(htmlMsgNode, "monospaced-message");
        if (gPrefs["monospaced_snippets"])
          _mm_addClass(snippetMsgNode, "monospaced-snippet");

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
            msgHdrsDelete([msgHdr]);
            if (l > 1)
              gFolderDisplay.selectMessages(selectedMessages.filter(function (x) x.messageId != msgHdr.messageId));
          });
        register(".button-archive", function archive_listener (event) {
            let selectedMessages = gFolderDisplay.selectedMessages;
            let l = gFolderDisplay.selectedIndices.length;
            msgHdrsArchive([msgHdr], window);
            if (l > 1)
              gFolderDisplay.selectMessages(selectedMessages.filter(function (x) x.messageId != msgHdr.messageId));
          });
        register(".action.mark-read", function markreadnode_listener (event) {
            msgHdrsMarkAsRead([msgHdr], !msgHdr.isRead);
          });

        /* Now the expand collapse and stuff */
        register(".grip", gconversation.stash.collapse_all[iCopy]);
        register(null, gconversation.stash.expand_all[iCopy], "dblclick");
        register(".snippetmsg", gconversation.stash.expand_all[iCopy]);
        msgNode.addEventListener("keypress", function keypress_listener (event) {
            if (event.charCode == 'o'.charCodeAt(0) || event.keyCode == 13) {
              if (msgNode.classList.contains("collapsed")) {
                /* Although iframe expansion preserves scroll value, we must do
                 * that *after* the iframe has been expanded, otherwise, the
                 * viewport might be too short and won't allow scrolling to the
                 * right value already. */
                runOnceAfterNSignals(1, function () scrollNodeIntoView(msgNode));
                gconversation.stash.expand_all[iCopy]();
              } else {
                gconversation.stash.collapse_all[iCopy]();
              }
            }
            if (event.keyCode == 8) {
              gconversation.on_back();
            }
            if (event.charCode == 'h'.charCodeAt(0)) {
              msgNode.style.display = "none";
            }
            if (event.charCode == 'n'.charCodeAt(0)) {
              if (msgNode.nextElementSibling)
                msgNode.nextElementSibling.focus();
              event.preventDefault();
            }
            if (event.charCode == 'p'.charCodeAt(0)) {
              let prev = msgNode.previousElementSibling;
              if (prev) {
                prev.focus();
                /* This is why this works better than shift-tab. We make sure
                 * the message is not hidden by the header! */
                if (htmlpane.contentDocument.documentElement.scrollTop > prev.offsetTop - 5)
                  htmlpane.contentWindow.scrollTo(0, prev.offsetTop - 5);
              }
              event.preventDefault();
            }
            if (event.charCode == 'r'.charCodeAt(0)) {
              compose(Ci.nsIMsgCompType.ReplyToSender, event);
              event.preventDefault();
            }
            if (event.charCode == 'a'.charCodeAt(0)) {
              compose(Ci.nsIMsgCompType.ReplyAll, event);
              event.preventDefault();
            }
            if (event.charCode == 'f'.charCodeAt(0)) {
              forward(event);
              event.preventDefault();
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

                /* Do some reformatting */
                iframeDoc.body.style.padding = "0";
                iframeDoc.body.style.margin = "0";
                /* Deal with people who have bad taste */
                iframeDoc.body.style.color = "black";
                iframeDoc.body.style.backgroundColor = "white";

                /* Our super-advanced heuristic ;-) */
                let hasHtml = !(
                  iframeDoc.body.firstElementChild &&
                  (_mm_hasClass(iframeDoc.body.firstElementChild, "moz-text-flowed") ||
                   _mm_hasClass(iframeDoc.body.firstElementChild, "moz-text-plain")));

                /* The part below is all about quoting */
                /* Launch various heuristics to convert most common quoting styles
                 * to real blockquotes. Spoiler: most of them suck. */
                convertOutlookQuotingToBlockquote(iframeDoc);
                convertHotmailQuotingToBlockquote1(iframeDoc);
                convertHotmailQuotingToBlockquote2(iframe.contentWindow, iframeDoc, gPrefs["hide_quote_length"]);
                convertForwardedToBlockquote(iframeDoc);
                fusionBlockquotes(iframeDoc);
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
                                iframe.style.height = (parseInt(iframe.style.height) + h)+"px";
                              }, true);
                            div.setAttribute("style", "color: #512a45; cursor: pointer; font-size: 90%;");
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
                /* Oh baby that was so subtle */
                iframeDoc.body.previousSibling.appendChild(style);

                /* Remove the attachments if the user has not set View >
                 * Display Attachments Inline */
                let fieldsets = iframeDoc.getElementsByClassName("mimeAttachmentHeader");
                for (let i = fieldsets.length - 1; i >= 0; i--) {
                  dump("Found an attachment, removing... please uncheck View > Display attachments inline.\n");
                  let node = fieldsets[i];
                  while (node.nextSibling)
                    node.parentNode.removeChild(node.nextSibling);
                  node.parentNode.removeChild(node);
                }

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
                      _mm_toggleClass(elt, "pre-as-regular");
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
                      dump("Reloading with "+BDMCharsetPhaseParams.charsetToForce+"\n");
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
            let url = msgHdrToNeckoURL(msgHdr, gMessenger);

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
            messageService.DisplayMessage(uri+"?header=none",
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

            let body = messageBodyFromMsgHdr(msgHdr, true);
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
            tooltip.removeChild(tooltip.firstElementChild); /* remove gloda warning */
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
                  value = GlodaUtils.deMime(value); /* I <3 gloda */
                let valueNode = htmlpane.contentDocument.createTextNode(value);
                tooltip.appendChild(headerNode);
                tooltip.appendChild(valueNode);
                tooltip.appendChild(htmlpane.contentDocument.createElement("br"));
              }
            }
            tooltip.removeChild(tooltip.children[tooltip.children.length - 1]);

            /* Add the view source link */
            let viewSource = htmlpane.contentDocument.createElement("div");
            viewSource.classList.add("view-source");
            tooltip.appendChild(viewSource);
            let viewSourceLink = htmlpane.contentDocument.createElement("span");
            viewSourceLink.classList.add("link");
            viewSourceLink.classList.add("view-source-link");
            viewSourceLink.textContent = stringBundle.getString("view_source");
            let uri = msgHdr.folder.getUriForMsg(msgHdr);
            viewSourceLink.addEventListener("click", function(event) {
                ViewPageSource([uri]); /* mailCommands.js, maybe */
              }, true);
            viewSource.appendChild(viewSourceLink);

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
            let attachments = MimeMessageGetAttachments(aMimeMsg);
            let [makePlural, ] = PluralForm.makeGetter(stringBundle.getString("plural_rule"));
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
                _mm_addClass(a, "link");
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
                  _mm_addClass(singleBox, "att"+j);
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
                    _mm_addClass(singleBox.getElementsByTagName("img")[0], "image-attachment-preview");
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
              dump("Registering expandAttachments "+iCopy+"\n");
              expandAttachments = displayFullAttachments;
            } /* end if (attachments.length > 0) */

            signal();
          }); /* end MsgHdrToMimeMessageCallback_ */
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          fallbackNoGloda();
        }

        /* Attach various event handlers. Here: open a message when the user
         * clicks on the sender's name. */
        let sender = msgNode.getElementsByClassName("sender")[0];
        sender.msgHdr = msgHdr;
        sender.folder = msgHdr.folder;
        sender.msgKey = msgHdr.messageKey;
        sender.addEventListener("click", function(e) {
          /* Cancel the next attempt to load a conversation, we explicitely
           * requested this message. */
          let url = msgHdrToNeckoURL(msgHdr, gMessenger);
          gconversation.stash.wantedUrl = url.spec;

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

      // stash somewhere so it doesn't get GC'ed
      this._glodaQueries.push(
        Gloda.getMessageCollectionForHeaders(this._msgHdrs, this));
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
      gconversation.stash.q1 = Gloda.getMessageCollectionForHeaders(aSelectedMessages, {
        onItemsAdded: function (aItems) {
          if (!aItems.length) {
            myDump("!!! GConversation: gloda query returned no messages!\n");
            k(null, aSelectedMessages, aSelectedMessages[0]);
            return;
          }
          let msg = aItems[0];
          gconversation.stash.q2 = msg.conversation.getMessagesCollection({
            onItemsAdded: function (aItems) {
            },
            onItemsModified: function () {},
            onItemsRemoved: function () {},
            /* That's a XPConnect bug. bug 547088, so track the
             * bug and remove the setTimeout when it's fixed and bump the
             * version requirements in install.rdf.template */
            onQueryCompleted: function pullConversationOnQueryCompleted_ (aCollection)
              setTimeout(function pullConversationInternalCallback2_ ()
                gFolderDisplay.selectedMessage.messageId == firstMessageId
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
    if (gconversation.stash.multiple_selection)
      return true;
    let newConversation = false;
    for (let i = 0; i < Math.max(items.length, gconversation.stash.msgHdrs.length); ++i) {
      if (i >= items.length || i >= gconversation.stash.msgHdrs.length ||
          items[i].messageId != gconversation.stash.msgHdrs[i].messageId) {
        newConversation = true;
        break;
      }
    }
    return newConversation;
  }

  /* Actually it's more tricky than it seems because of the "focus currently
   * selected message" option. It has the wicked side effect that:
   * - we when reload the exact same conversation, maybe we want to focus a
   *   different node
   * - maybe we have a leftover "focus-me-first" node from a previously selected
   *   message that triggered the conversation. This node has .selected AND
   *   tabindex=1. */
  function restorePreviousConversation() {
    /* I have never seen leftover focus on my Linux box but we're never sure */
    let badMsg = htmlpane.contentDocument.querySelector(".message:focus");
    if (badMsg)
      badMsg.blur();

    /* Remove all previous focus-me-first hooks */
    let badMsgs = htmlpane.contentDocument
      .querySelectorAll(".message.selected, .message[tabindex=\"1\"]");
    if (badMsgs.length > 1)
      myDump("!!! SEVERE MISTAKE JONATHAN LOOK INTO THIS RIGHT NOW\n");
    for each (let [, msgNode] in Iterator(badMsgs)) {
      _mm_removeClass(msgNode, "selected");
      if (msgNode.previousElementSibling)
        msgNode.setAttribute("tabindex",
          parseInt(msgNode.previousElementSibling.getAttribute("tabindex"))+1);
      else /* It's the first one in the list */
        msgNode.setAttribute("tabindex", 2);
    }

    let needsFocus = tellMeWhoToFocus(gconversation.stash.msgHdrs);

    runOnceAfterNSignals(
      gconversation.stash.msgHdrs.length,
      function f_temp5() {
        dump("f_temp5 is HERE\n");
        let msgNode = msgHdrToMsgNode(gconversation.stash.msgHdrs[needsFocus]);
        scrollNodeIntoView(msgNode);
        variousFocusHacks(msgNode);
      }
    );

    let actionList = tellMeWhoToExpand(gconversation.stash.msgHdrs, needsFocus);
    for each (let [i, action] in Iterator(actionList)) {
      switch (action) {
        case kActionDoNothing:
          signal();
          break;
        case kActionCollapse:
          gconversation.stash.collapse_all[i]();
          break;
        case kActionExpand:
          gconversation.stash.expand_all[i]();
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
    if (aSelectedMessages.length == 0) {
      myDump("No selected messages\n");
      return false;
    } else {
      myDump(aSelectedMessages.length + " selected messages\n");
    }
    htmlpane.contentWindow.enableExtraButtons();
    gconversation.stash.multiple_selection = false;

    pullConversation(
      aSelectedMessages,
      function (aCollection, aItems, aMsg) {
        let items;
        let clearErrors = function () {
          for each (let [,e] in Iterator(htmlpane.contentDocument.getElementsByClassName("error")))
            e.style.display = "none";
        };
        /* Don't confuse users with this message, it's not relevant in this case */
        htmlpane.contentDocument.getElementById("info_af_box").style.display = "none";
        if (aCollection) {
          clearErrors();
          items = [selectRightMessage(x, gDBView.msgFolder) for each ([, x] in Iterator(groupMessages(aCollection.items)))];
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
            dump(e+"\n");
            throw e;
          }
          if (gPrefs["auto_mark_read"] && document.hasFocus())
            gconversation.mark_all_read();
        } else {
          restorePreviousConversation();
        }
        return;
      }
    );

    return true;
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
        gconversation.stash.multiple_selection = true;
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
  gconversation.on_load_thread = function() {
    if (!checkGlodaEnabled())
      return;
    summarizeThread(gFolderDisplay.selectedMessages, null, true);
    gMessageDisplay.singleMessageDisplay = false;
  };

  gconversation.on_load_thread_tab = function(event) {
    if (!gFolderDisplay.selectedMessages.length)
      return;
    if (!checkGlodaEnabled())
      return;

    let aSelectedMessages = gFolderDisplay.selectedMessages;
    if (event.shiftKey) {
      let tabmail = document.getElementById("tabmail");
      tabmail.openTab("message", {msgHdr: aSelectedMessages[0], background: false});
      gconversation.on_load_thread();
    } else {
      pullConversation(
        gFolderDisplay.selectedMessages,
        function (aCollection, aItems, aMsg) {
          let tabmail = document.getElementById("tabmail");
          if (aCollection) {
            aCollection.items = [selectRightMessage(m) for each ([, m] in Iterator(groupMessages(aCollection.items)))];
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
  gconversation.print = function () {
    document.getElementById("multimessage").contentWindow.print();
  };

  /* The button as well as the menu item are hidden and disabled respectively
   * when we're viewing a MultiMessageSummary, so fear not marking wrong
   * messages as read. */
  gconversation.mark_all_read = function () {
    /* XXX optimize here and do a union beforehand */
    msgHdrsMarkAsRead(gconversation.stash.msgHdrs, true);
    msgHdrsMarkAsRead(gFolderDisplay.selectedMessages, true);
  };

  gconversation.archive_all = function () {
    if (gconversation.stash.multiple_selection)
      MsgArchiveSelectedMessages(null);
    else
      msgHdrsArchive(gconversation.stash.msgHdrs.concat(gFolderDisplay.selectedMessages), window);
  };

  gconversation.delete_all = function () {
    if (gconversation.stash.multiple_selection)
      msgHdrsDelete(gFolderDisplay.selectedMessages);
    else
      msgHdrsDelete(gconversation.stash.msgHdrs.concat(gFolderDisplay.selectedMessages));
  };

  /* This actually does what we want. It also expands threads as needed. */
  gconversation.on_back = function (event) {
    gMessageDisplay.singleMessageDisplay = true;
    gFolderDisplay.selectMessage(gFolderDisplay.selectedMessages[0]);
    document.getElementById("threadTree").focus();
  };

  gconversation.on_expand_all = function (event) {
    for each (let [, f] in Iterator(gconversation.stash.expand_all))
      f();
  };

  gconversation.on_collapse_all = function (event) {
    for each (let [, f] in Iterator(gconversation.stash.collapse_all))
      f();
  };

  /* We need to attach our custom context menu to multimessage, that's simpler
   * than using an overlay. */
  document.getElementById("multimessage").setAttribute("context", "gConvMenu");

  /* Watch the location changes in the messagepane (single message view) to
   * display a conversation if relevant. */
  let messagepane = document.getElementById("messagepane");
  gconversation.stash.uriWatcher = {
    onStateChange: function () {},
    onProgressChange: function () {},
    onSecurityChange: function () {},
    onStatusChange: function () {},
    onLocationChange: function (aWebProgress, aRequest, aLocation) {
      /* By testing here for the pref, we allow the pref to be changed at
       * run-time and we do not require to restart Thunderbird to take the
       * change into account. */
      if (!gPrefs["auto_fetch"])
        return;

      /* The logic is as follows.
       * i) The event handler stores the URI of the message we're jumping to.
       * ii) We catch that message loading: we don't load a conversation.
       * iii) We don't want to load a conversation if we're viewing a message
       * that's in an expanded thread. */
      let wantedUrl = gconversation.stash.wantedUrl;
      gconversation.stash.wantedUrl = null;
      let isExpanded = false;
      let msgIndex = gFolderDisplay ? gFolderDisplay.selectedIndices[0] : -1;
      if (msgIndex >= 0) {
        try {
          let rootIndex = gDBView.findIndexOfMsgHdr(gDBView.getThreadContainingIndex(msgIndex).getChildHdrAt(0), false);
          if (rootIndex >= 0)
            isExpanded = gDBView.isContainer(rootIndex) && !gFolderDisplay.view.isCollapsedThreadAtIndex(rootIndex);
        } catch (e) {
          myDump("Error in the onLocationChange handler "+e+"\n");
        }
      }
      if (aLocation.spec == wantedUrl || isExpanded)
        return;

      let msgService;
      try {
        msgService = gMessenger.messageServiceFromURI(aLocation.spec);
      } catch ( { result } if result == Cr.NS_ERROR_FACTORY_NOT_REGISTERED ) {
        myDump("*** Not a message ("+aLocation.spec+")\n");
        return;
      }
      let msgHdr = msgService.messageURIToMsgHdr(aLocation.QueryInterface(Ci.nsIMsgMessageUrl).uri);
      /* We need to fork the code a little bit here because we can't activate
       * the multimessage view unless we're really sure that we've got more than
       * one message */
      pullConversation(
        [msgHdr],
        function pullConversationAutoFetchCallback_ (aCollection, aItems, aMsg) {
          if (aCollection) {
            let items = groupMessages(aCollection.items);
            if (items.length <= 1)
              return;
            /* Don't forget to show the right buttons */
            htmlpane.contentWindow.enableExtraButtons();

            let rightMessages = [selectRightMessage(x, gDBView.msgFolder) for each ([, x] in Iterator(items))];
            rightMessages = rightMessages.filter(function (x) x);
            rightMessages = rightMessages.map(function (x) x.folderMessage);
            gMessageDisplay.singleMessageDisplay = false;
            if (isNewConversation(rightMessages)) {
              let gSummary = new ThreadSummary(rightMessages, null);
              try {
                if (!gPrefs["info_af_shown"]) {
                  let info_af_box = htmlpane.contentDocument.getElementById("info_af_box");
                  info_af_box.style.display = "block";
                  let yes = info_af_box.getElementsByClassName("info_af_yes")[0];
                  let no = info_af_box.getElementsByClassName("info_af_no")[0];
                  yes.addEventListener("click", function (event) {
                      info_af_box.style.display = "none";
                      prefs.setBoolPref("info_af_shown", true);
                    }, true);
                  no.addEventListener("click", function (event) {
                      info_af_box.style.display = "none";
                      prefs.setBoolPref("info_af_shown", true);
                      prefs.setBoolPref("auto_fetch", false);
                    }, true);
                }
                gSummary.init();
              } catch (e) {
                myDump("!!! "+e+"\n");
                throw e;
              }
            } else {
              restorePreviousConversation();
            }
            return;
          }
      });
    },
    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsISupportsWeakReference, Ci.nsIWebProgressListener])
  };
  messagepane.addProgressListener(gconversation.stash.uriWatcher, Ci.nsIWebProgress.NOTIFY_ALL);

  myDump("*** gConversation loaded\n");
}, false);
