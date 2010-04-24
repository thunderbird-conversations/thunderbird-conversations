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
  on_collapse_all: null,
  on_expand_all: null,
  /* Used by both the in-conversation toolbar and the right-click menu */
  mark_all_read: null,
  archive_all: null,
  delete_all: null,
  print: null,
  /* Prevent GC */
  stash: {
    wantedUrl: null,
    q1: null,
    q2: null,
    msgHdrs: null,
    multiple_selection: false,
    expand_all: [],
    collapse_all: []
  }
};

/* We use a function because of global namespace pollution. We use "onload"
 * because we need the <stringbundle> to be available. */
document.addEventListener("load", function f_temp0 () {
  document.removeEventListener("load", f_temp0, true); /* otherwise it's called 20+ times */

  /* Enigmail support, thanks to Patrick Brunschwig ! */
  let hasEnigmail = (typeof(GetEnigmailSvc) == "function");
  let enigmailSvc;
  if (hasEnigmail)
    enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    myDump("Error loading the Enigmail service.\n");
    hasEnigmail = false;
  }
  function tryEnigmail(bodyElement) {
    if (bodyElement.textContent.indexOf("-----BEGIN PGP") < 0)
      return [];

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
  Components.utils.import("resource://gconversation/VariousUtils.jsm");
  Components.utils.import("resource://gconversation/GlodaUtils.jsm");
  Components.utils.import("resource://gconversation/MsgHdrUtils.jsm");

  /* For debugging purposes */
  let consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
  function myDump(aMsg) {
    dump(aMsg);
    if (consoleService)
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
  const stringBundle = document.getElementById("gconv-string-bundle");


  /* Preferences are loaded once and then observed. For a new pref, add an entry
   * here + a case in the switch below. */
  let gPrefs = {};
  gPrefs["monospaced"] = prefs.getBoolPref("monospaced");
  gPrefs["monospaced_snippets"] = prefs.getBoolPref("monospaced_snippets");
  gPrefs["focus_first"] = prefs.getBoolPref("focus_first");
  gPrefs["fold_rule"] = prefs.getCharPref("fold_rule");
  gPrefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
  gPrefs["reverse_order"] = prefs.getBoolPref("reverse_order");
  gPrefs["auto_fetch"] = prefs.getBoolPref("auto_fetch");
  gPrefs["auto_mark_read"] = prefs.getBoolPref("auto_mark_read");
  gPrefs["disable_error_empty_collection"] = prefs.getBoolPref("disable_error_empty_collection");
  gPrefs["monospaced_senders"] = prefs.getCharPref("monospaced_senders").split(",");

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
      switch (aData) {
        case "monospaced":
        case "monospaced_snippets":
        case "focus_first":
        case "reverse_order":
        case "auto_fetch":
        case "auto_mark_read":
        case "disable_error_empty_collection":
          gPrefs[aData] = prefs.getBoolPref(aData);
          break;
        case "hide_quote_length":
          gPrefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
          break;
        case "fold_rule":
          gPrefs["fold_rule"] = prefs.getCharPref("fold_rule");
          break;
        /* Warning this one has no key in gPrefs */
        case "toolbar_text_plus_icons":
          let htmlpane = document.getElementById('multimessage');
          /* We toggle it because we know that multimessageview.xhtml has set it
           * in the right position. */
          _mm_toggleClass(htmlpane.contentDocument.getElementById("buttonhbox"), "text-plus-icons");
          break;
        case "monospaced_senders":
          gPrefs["monospaced_senders"] = prefs.getCharPref("monospaced_senders").split(",");
          break;
      }
    }
  };
  myPrefObserver.register();

  const predefinedColors = ["#204a87", "#5c3566", "#8f5902", "#a40000", "#4e9a06", "#ce5c00"];
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
      /* XXX we can probably do better here (avoid colors that are too
       * "light") */
      let rand = function () Math.round(Math.random()*255);
      let r = rand();
      let g = rand();
      let b = rand();
      return "rgb("+r+","+g+","+b+")";
    }
  }
  /* Return the color for a given person or create it */
  function colorFor(person) {
    if (!id2color[person])
      id2color[person] = newColor();
    return id2color[person];
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
  function processEmails (emailAddresses) {
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
        address.displayName = stringBundle.getString("me");
      } else if (cardDetails.card) { /* We know the guy */
        //myDump("Got a card for "+address.emailAddress+"!\n");
        address.displayName = cardDetails.card.displayName;
      }
      decodedAddresses.push(address);
    }

    function colorize(name) {
      if (name)
        return "<span style=\"color:"+colorFor(name)+"\">"+name+"</span>";
      else
        return name;
    }
    return [colorize(a.displayName) || colorize(a.emailAddress) for each ([, a] in Iterator(decodedAddresses))].join(", ");
  }

  /* Actually we don't need to change the constructor, only members */
  ThreadSummary.prototype = {
    __proto__: MultiMessageSummary.prototype,

    summarize: function ThreadSummary_summarize() {
      /* We need to keep them at hand for the "Mark all read" command to work
       * properly (and others). THis is set by the original constructor that
       * we're not overriding here, see the original selectionsummaries.js */
      gconversation.stash.msgHdrs = this._msgHdrs;
      gconversation.stash.expand_all = [];
      gconversation.stash.collapse_all = [];

      /* Reset the set of known colors */
      resetColors();

      this._msgNodes = {};

      let htmlpane = document.getElementById('multimessage');

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

      /* Useful for stripping the email from mime2DecodedAuthor for instance */
      let count = 0;
      const MAX_THREADS = 100;
      const SNIPPET_LENGTH = 300;
      let maxCountExceeded = false;

      /* Determine which message is going to be focused */
      let needsFocus = -1;
      if (gPrefs["focus_first"]) {
        needsFocus = numMessages - 1;
        for (let i = 0; i < numMessages; ++i) {
          if (!this._msgHdrs[i].isRead) {
            needsFocus = i;
            break;
          }
        }
      } else {
        let uri = function (msg) msg.folder.getUriForMsg(msg);
        let key = uri(gFolderDisplay.selectedMessage);
        myDump("Currently selected message key is "+key+"\n");
        for (let i = 0; i < numMessages; ++i) {
          myDump("Examining "+uri(this._msgHdrs[i])+"\n");
          if (uri(this._msgHdrs[i]) == key) {
            needsFocus = i;
            break;
          }
        }
      }

      /* Create a closure that can be called later when all the messages have
       * been properly loaded, all the iframes resized to fit. When the page
       * won't scroll anymore, we manually set the message we want into view. */
      myDump(numMessages+" messages total, focusing "+needsFocus+"\n");
      let msgHdrs = this._msgHdrs;
      let msgNodes = this._msgNodes;
      function scrollMessageIntoView (needsFocus) {
          myDump("I'm asked to focus message "+needsFocus+"\n");
          let tKey = msgHdrs[needsFocus].messageKey + msgHdrs[needsFocus].folder.URI;
          /* Because of the header that hides the beginning of the message,
           * scroll a bit more. XXX unused ? */
          /* let h = document.getElementById("multimessage")
            .contentDocument.getElementById("headingwrappertable")
            .getBoundingClientRect().height; */
          myDump("Scrolling to "+tKey+"\n");
          /* Don't ask */
          setTimeout(
            function ()
              document.getElementById("multimessage").contentWindow.scrollTo(0, msgNodes[tKey].offsetTop - 5),
            0);
      }

      /* For each message, once the message has been properly set up in the
       * conversation view (either folded or unfolded), this function is called.
       * When all the messages have been filled, it scrolls to the one we want.
       * That way, no more reflows after we have scrolled to the right message. */
      let nMessagesDone = numMessages;
      function messageDone() {
        myDump("messageDone()\n");
        nMessagesDone--;
        if (nMessagesDone == 0 && needsFocus >= 0)
          scrollMessageIntoView(needsFocus);
      }

      /* Now this is for every message. Note to self: all functions defined
       * inside the loop must be defined using let f = ... (otherwise the last
       * definition is always called !). */
      for (let i = 0; i < numMessages; ++i) {
        myDump("*** Treating message "+i+"\n");
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }

        let msgHdr = this._msgHdrs[i];
        let key = msgHdr.messageKey + msgHdr.folder.URI;
        myDump("Registering "+key+"\n");

        let msg_classes = "message collapsed";
        if (!msgHdr.isRead)
          msg_classes += " unread";
        if (msgHdr.isFlagged)
          msg_classes += " starred";

        let theSubject = msgHdr.mime2DecodedSubject;
        let date = makeFriendlyDateAgo(new Date(msgHdr.date/1000));

        /* The snippet class really has a counter-intuitive name but that allows
         * us to keep the style from the original multimessageview.css without
         * rewriting everything */
        let replyTxt = stringBundle.getString("reply");
        let replyAllTxt = stringBundle.getString("reply_all");
        let forwardTxt = stringBundle.getString("forward");
        let markSpamTxt = stringBundle.getString("mark_spam");
        let archiveTxt = stringBundle.getString("archive");
        let deleteTxt = stringBundle.getString("delete");
        let replyList = stringBundle.getString("reply_list");
        let editNew = stringBundle.getString("edit_new");
        let toTxt = stringBundle.getString("to");
        let detailsTxt = stringBundle.getString("details");
        let msgContents =
          <div class="row">
            <div class="notification-icons">
              <div class="star"/>
              <div class="enigmail-enc-ok" style="display: none" />
              <div class="enigmail-sign-ok" style="display: none" />
              <div class="enigmail-sign-unknown" style="display: none" />
              <div class="attachment" style="display: none"></div>
              <div class="tags"></div>
            </div>
            <div class="link-action-area">
              <a class="action link-reply">{replyTxt}</a>
              <a class="action link-reply-all">{replyAllTxt}</a>
              <a class="action link-forward">{forwardTxt}</a>
              <a class="action toggle-font link" style="display: none">
                <img src="chrome://gconversation/skin/font.png" />
              </a>
              <a class="action mark-read link">
                <img src="chrome://gconversation/skin/readcol.png" />
              </a>
              <a class="action delete-msg link">
                <img src="chrome://gconversation/skin/trash.gif" />
              </a>
            </div>
            <div class="header">
              <div class="wrappedsender">
                <div class="msgheader-details-toggle">{detailsTxt}</div>
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
              <hbox class="button-action-area" align="start" xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" xmlns:html="http://www.w3.org/1999/xhtml">
                <button class="button button-reply">{replyTxt}</button>
                <button class="button button-forward">{forwardTxt}</button>
                <button class="button" type="menu">
                  More Actions
                  <menupopup>
                    <menuitem class="menu-editNew">{editNew}</menuitem>
                    <menuitem class="menu-replyList">{replyList}</menuitem>
                  </menupopup>
                </button>
                <spacer flex="1" />
                <button class="button button-markSpam">{markSpamTxt}</button>
                <button disabled="true" class="button button-archive">{archiveTxt}</button>
                <button class="button button-delete">{deleteTxt}</button>
              </hbox>
            </div>
          </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        this._msgNodes[key] = msgNode;
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();
        _mm_addClass(msgNode, msg_classes);
        if (gPrefs["reverse_order"]) {
          messagesElt.insertBefore(msgNode, messagesElt.firstChild);
        } else {
          messagesElt.appendChild(msgNode);
        }

        /* This function is central. It takes care of collapsing / expanding a
         * single message. The message is initially collapsed. The let-style
         * bindings are mandatory, otherwise the definitions are overwritten at
         * each iteration and we end up always calling the last definition. */
        let toCall = [];
        let toggleMessage = function toggleMessage_ () {
          _mm_toggleClass(msgNode, "collapsed");
          while (toCall.length > 0)
            (toCall.pop())();
        };
        let messageIsCollapsed = function messageIsCollapsed_ () {
          return _mm_hasClass(msgNode, "collapsed");
        };
        let callOnceAfterToggle = function callOnceAfterToggle_ (f) {
          toCall.push(f);
        };
        gconversation.stash.expand_all.push(function () {
          if (messageIsCollapsed())
            toggleMessage();
        });
        gconversation.stash.collapse_all.push(function () {
          if (!messageIsCollapsed())
            toggleMessage();
        });

        /* Warn the user if this is a draft */
        if (msgHdrIsDraft(msgHdr)) {
          let draftTxt = stringBundle.getString("draft");
          msgNode.getElementsByClassName("draft-warning")[0].textContent = draftTxt;
        }

        /* Various useful DOM nodes */
        let senderNode = msgNode.getElementsByClassName("sender")[0];
        let recipientsNode = msgNode.getElementsByClassName("recipients")[0];
        let htmlMsgNode = msgNode.getElementsByClassName("htmlmsg")[0];
        let plainTextMsgNode = msgNode.getElementsByClassName("plaintextmsg")[0];
        let snippetMsgNode = msgNode.getElementsByClassName("snippetmsg")[0];
        let toggleFontNode = msgNode.getElementsByClassName("toggle-font")[0];
        let actionNode = msgNode.getElementsByClassName("link-action-area")[0];

        /* Register collapse/expand handlers */
        snippetMsgNode.addEventListener("click", toggleMessage, true);

        /* Insert fancy colored html */
        let senderName = processEmails(msgHdr.mime2DecodedAuthor);
        let recipientsNames = processEmails(msgHdr.mime2DecodedRecipients);
        let ccNames = processEmails(msgHdr.ccList);
        senderNode.innerHTML = senderName;
        recipientsNode.innerHTML =
          ccNames ? recipientsNames + ", " + ccNames : recipientsNames;

        /* Style according to the preferences. Preferences have an observer, see
         * above for details. */
        if (gPrefs["monospaced"])
          _mm_addClass(htmlMsgNode, "monospaced-message");
        if (gPrefs["monospaced_snippets"])
          _mm_addClass(snippetMsgNode, "monospaced-snippet");

        /* Try to enable at least some keyboard navigation */
        let tabIndex;
        if (gPrefs["reverse_order"])
          tabIndex = numMessages - i;
        else
          tabIndex = i;
        /* I don't know why but Tb doesn't seem to like tabindex 0 */
        tabIndex++;
        msgNode.setAttribute("tabindex", tabIndex);

        /* This object is used by the event listener below to pass information
         * to the event listeners far below whose task is to setup the iframe.
         * */
        let focusInformation = {
          i: i,
          delayed: false,
          keyboardOpening: false,
          iFrameWasLoaded: false
        };
        msgNode.addEventListener("keypress", function keypress_listener (event) {
            if (event.charCode == 'o'.charCodeAt(0)) {
              myDump("i is "+focusInformation.i+"\n");

              /* If the iframe hasn't been loaded yet, this will trigger a
               * refocus as soon as the iframe is done loading. */
              focusInformation.keyboardOpening = true;

              /* Let's go */
              toggleMessage();

              /* Since toggleMessage() is now immediate, we can focus the thing
               * right now (otherwise the iframe code will take care of focusing
               * it for us thanks to keyboardOpening). */
              if (focusInformation.iFrameWasLoaded)
                scrollMessageIntoView(focusInformation.i);
            }
            if (event.keyCode == '8') {
              gconversation.on_back();
            }
            if (event.charCode == 'h'.charCodeAt(0)) {
              msgNode.style.display = "none";
            }
          }, true);

        /* Now we're registered the event listeners, the message is folded by
         * default. If we're supposed to unfold it, do it now */
        if ((gPrefs["fold_rule"] == "unread_and_last" && (!msgHdr.isRead || i == needsFocus)) ||
            (gPrefs["fold_rule"] == "all")) {
          try {
            toggleMessage();
          } catch (e) {
            myDump("Error "+e+"\n");
          }
        }

        /* Same thing but for HTML messages. The HTML is heavily processed to
         * detect extra quoted parts using different heuristics, the "- show/hide
         * quoted text -" links are added. */
        let fillSnippetAndHTML = function fillSnippetAndHTML_ () {
          let originalScroll; /* This is shared by the nested event listeners below */

          let iframe = htmlpane.contentDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "iframe");
          iframe.setAttribute("style", "height: 20px");
          iframe.setAttribute("type", "content");
          /* The xul:iframe automatically loads about:blank when it is added
           * into the tree. We need to wait for the document to be loaded before
           * doing things.
           *
           * Why do we do that ? Basically because we want the <xul:iframe> to
           * have a docShell and a webNavigation. If we don't do that, and we
           * set directly src="about:blank" in the XML above, sometimes we are
           * too fast and the docShell isn't ready by the time we get there. */
          iframe.addEventListener("load", function f_temp2(event) {
              iframe.removeEventListener("load", f_temp2, true);

              /* The second load event is triggered by loadURI with the URL
               * being the necko URL to the given message. */
              iframe.addEventListener("load", function f_temp1(event) {
                  iframe.removeEventListener("load", f_temp1, true);
                  let iframeDoc = iframe.contentDocument;

                  /* Do some reformatting */
                  iframeDoc.body.style.padding = "0";
                  iframeDoc.body.style.margin = "0";

                  /* The default size for HTML messages' content is too big! */
                  let hasHtml = !(
                    iframeDoc.body.firstElementChild &&
                    (_mm_hasClass(iframeDoc.body.firstElementChild, "moz-text-flowed") ||
                     _mm_hasClass(iframeDoc.body.firstElementChild, "moz-text-plain")));

                  /* The part below is all about quoting */
                  /* Launch various heuristics to convert most common quoting styles
                   * to real blockquotes. */
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
                          let numLines = parseInt(style.height) / parseInt(style.lineHeight);
                          if (numLines > gPrefs["hide_quote_length"]) {
                            let div = iframeDoc.createElement("div");
                            div.setAttribute("class", "link showhidequote");
                            div.addEventListener("click", function div_listener (event) {
                                let h = htmlpane.contentWindow.toggleQuote(event);
                                iframe.style.height = (parseInt(iframe.style.height) + h)+"px";
                              }, true);
                            div.setAttribute("style", "color: #512a45; cursor: pointer; font-size: small;");
                            div.appendChild(document.createTextNode("- "+
                              stringBundle.getString("showquotedtext")+" -"));
                            elt.insertBefore(div, c);
                            c.style.display = "none";
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
                  style.appendChild(iframeDoc.createTextNode(
                    ".pre-as-regular {\n"+
                    "  font-family: sans !important;\n"+
                    "  font-size: medium !important;\n"+
                    "}\n"+
                    "fieldset.mimeAttachmentHeader,\n"+
                    "fieldset.mimeAttachmentHeader + br,\n"+
                    "fieldset.mimeAttachmentHeader + br + p,\n"+
                    "fieldset.mimeAttachmentHeader + br + p + center,\n"+
                    "fieldset.mimeAttachmentHeader + br + p + center + p {\n"+
                    "  display: none;\n"+
                    "}\n"
                    ));
                  iframeDoc.body.previousSibling.appendChild(style);


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
                       * high. */
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

                  /* Hello, Enigmail. Do that now, because decrypting a message
                   * will change its height. */
                  if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
                    let status = tryEnigmail(iframeDoc.body);
                    if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
                      msgNode.getElementsByClassName("enigmail-enc-ok")[0].style.display = "";
                    if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
                      msgNode.getElementsByClassName("enigmail-sign-ok")[0].style.display = "";
                    if (status & Ci.nsIEnigmail.UNKNOWN_SIGNATURE)
                      msgNode.getElementsByClassName("enigmail-sign-unknown")[0].style.display = "";
                  }

                  /* Everything's done, so now we're able to settle for a height. */
                  iframe.style.height = iframeDoc.body.scrollHeight+"px";

                  /* Attach the required event handlers so that links open in the
                   * external browser */
                  for each (let [, a] in Iterator(iframeDoc.getElementsByTagName("a"))) {
                    a.addEventListener("click", function link_listener (event) specialTabs.siteClickHandler(event, /^mailto:/), true);
                  }

                  /* Sometimes setting the iframe's content and height changes
                   * the scroll value */
                  if (focusInformation.delayed && originalScroll)
                    htmlpane.contentDocument.documentElement.scrollTop = originalScroll;

                  /* If it's an immediate display, fire the messageDone event
                   * now (we're done with the iframe). If we're delayed, the
                   * code that attached the event listener on the "click" event
                   * has already fired the messageDone event, so don't do it. */
                  if (!focusInformation.delayed)
                    messageDone();

                  /* This means that the first opening of the iframe is done
                   * using the keyboard shortcut. */
                  if (focusInformation.delayed && focusInformation.keyboardOpening)
                    scrollMessageIntoView(focusInformation.i);

                  /* Don't go to such lengths to make it work next time */
                  focusInformation.iFrameWasLoaded = true;

                  /* Here ends the chain of event listeners, nothing happens
                   * after this. */
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

              /* quotebody seems to be the best compromise (strips out both the
               * header and the attachments). Other possibly useful values for
               * the header parameter:
               *  - none (just like a regular message, but displays attachments
               *    inside, include inline images, which makes the conversations
               *    sloooooooow)
               *  - quote (is that useful?)
               *
               * See
               * http://mxr.mozilla.org/comm-central/source/mailnews/mime/src/nsStreamConverter.cpp#467
               * for other possible values.
               * */
              let cv = iframe.docShell.contentViewer;
              cv.QueryInterface(Ci.nsIMarkupDocumentViewer);
              cv.hintCharacterSet = "UTF-8";
              cv.hintCharacterSetSource = kCharsetFromMetaTag;
              iframe.docShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;
              iframe.webNavigation.loadURI(url.spec+"?header=none", iframe.webNavigation.LOAD_FLAGS_IS_LINK, null, null, null);
            }, true); /* end document.addEventListener */

          if (!messageIsCollapsed()) {
            focusInformation.delayed = false;
            /* The iframe is to be displayed, let's go. */
            /* NB: this currently triggers bug 540911, nothing we can do about
             * it right now. */
            htmlMsgNode.appendChild(iframe);
          } else {
            focusInformation.delayed = true;
            /* The height information that allows us to perform auto-resize is
             * only available if the iframe has been displayed at least once. In
             * this case, we start with the iframe hidden, so there's no way we
             * can perform styling, auto-resizing, etc. right now. We need to
             * wait for the iframe to be loaded first. To simplify things, the
             * whole process of adding the iframe into the tree and styling it
             * will be done when it is made visible for the first time. That is,
             * when we toggle the message for the first time. */
            callOnceAfterToggle(function f_temp3 () {
                originalScroll = htmlpane.contentDocument.documentElement.scrollTop;
                htmlMsgNode.appendChild(iframe);
              });
            /* Well, nothing will happen in the load process after that, so no
             * more reflows for this message -> the message is done. */
            messageDone();
          }
        };

        /* That part tries to extract extra information about the message using
         * Gloda */
        try {
          /* throw { result: Components.results.NS_ERROR_FAILURE }; */
          MsgHdrToMimeMessage(msgHdr, null, function (aMsgHdr, aMimeMsg) {
            if (aMimeMsg == null) // shouldn't happen, but sometimes does?
              return;
            /* The advantage here is that the snippet is properly stripped of
             * quoted text */
            let [snippet, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, SNIPPET_LENGTH);
            let [plainTextBody, ] = mimeMsgToContentAndMeta(aMimeMsg, aMsgHdr.folder);
            let attachments = MimeMessageGetAttachments(aMimeMsg);
            if (attachments.length > 0) {
              /* That's for the short paperclip icon */
              let attachmentNode = msgNode.getElementsByClassName("attachment")[0];
              attachmentNode.style.display = "";
              /* And for the longer description */
              let attachmentsTxt = stringBundle.getString("attachments");
              let areaNode = msgNode.getElementsByClassName("attachments-area")[0];
              areaNode.textContent = attachmentsTxt + " ("+attachments.length+")";
              let ul = htmlpane.contentDocument.createElement("ul");
              for each (let [, att] in Iterator(attachments)) {
                let li = htmlpane.contentDocument.createElement("li");
                li.textContent = att.name;
                ul.appendChild(li);

                /* Deal with images */
                /* See
                 * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#1993
                 * http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.xul#76
                 * for the relevant actions */
                /* if (att.contentType.indexOf("image/") === 0) {
                  let img = htmlpane.contentDocument.createElement("img");
                  img.setAttribute("src", att.url);
                  msgNode.appendChild(img);
                } */
              }
              areaNode.appendChild(ul);
            }

            plainTextMsgNode.textContent = plainTextBody.getContentString();
            snippetMsgNode.textContent = snippet;
          });
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          try {
            // Offline messages generate exceptions, which is unfortunate.  When
            // that's fixed, this code should adapt. XXX
            /* --> Try to deal with that. Try to come up with something that
             * remotely looks like a snippet. */
            let body = messageBodyFromMsgHdr(msgHdr, true);
            let snippet = body.substring(0, SNIPPET_LENGTH-3)+"...";
            snippetMsgNode.textContent = snippet;
            myDump("*** Got an \"offline message\"\n");
          } catch (e) {
            Application.console.log("Error fetching the message: "+e);
            /* Ok, that failed too... I'm out of ideas! */
            htmlMsgNode.textContent = "...";
            if (!snippetMsgNode.textContent)
              snippetMsgNode.textContent = "...";
          }
        }
        /* This actually setups the iframe to point to the given message */
        fillSnippetAndHTML();

        /* Handle tags associated to messages */
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

        /* The reply, reply to all, forward links. For reference, start reading
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
          for each (let [, node] in Iterator(msgNode.querySelectorAll(selector)))
            node.addEventListener(action, f, true);
        }
        register(".link-reply, .button-reply", function (event) {
            /* XXX this code should adapt when news messages have a JS
             * representation. See
             * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailWindowOverlay.js#1259
             * */
            compose(Ci.nsIMsgCompType.ReplyToSender, event);
          });
        register(".link-reply-all", function (event) {
            compose(Ci.nsIMsgCompType.ReplyAll, event);
          });
        register(".link-forward, .button-forward", function (event) {
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
          });
        register(".menu-replyList", function (event) {
            compose(Ci.nsIMsgCompType.ReplyToList, event);
          });
        register(".menu-editNew", function (event) {
            compose(Ci.nsIMsgCompType.Template, event);
          });
        register(".action.delete-msg, .button-delete", function deletenode_listener (event) {
            msgHdrsDelete([msgHdr]);
          });
        register(".action.mark-read", function markreadnode_listener (event) {
            msgHdrsMarkAsRead([msgHdr], !msgHdr.isRead);
          });
        register(".button-markSpam", function markspam_listener (event) {
            msgHdrMarkAsJunk(msgHdr);
          }),


        myDump("*** Completed message "+i+"\n");
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
    /* XXX tentative algorithm for dealing with non-strict threads.
     *
     * Get the first conversation. Mark in a Hashtbl all the messages we've
     * found according to their messageId. Move on to the remaining messages
     * from aItems. If they haven't been marked in the Hashtbl, re-launch a
     * conversation search for them too. Repeat the process until all messages
     * in aItems have been marked or aItems is empty.
     * */
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
            onQueryCompleted: function (aCollection) setTimeout(function () k(aCollection, aCollection.items, msg), 0),
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

  /* The summarizeThread function overwrites the default one, searches for more
   * messages, and passes them to our instance of ThreadSummary. This design is
   * more convenient as it follows Thunderbird's more closely, which allows me
   * to track changes to the ThreadSummary code in Thunderbird more easily. */
  summarizeThread = function(aSelectedMessages, aListener) {
    if (aSelectedMessages.length == 0) {
      myDump("No selected messages\n");
      return false;
    }
    let htmlpane = document.getElementById('multimessage');
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
        gSummary = new ThreadSummary(items, aListener);
        gSummary.init();

        if (gPrefs["auto_mark_read"] && document.hasFocus())
          gconversation.mark_all_read();
        return;
      }
    );

    return true;
  };

  /* We must catch the call to summarizeMultipleSelection to hide the buttons in
   * multimessageview.xhtml */
  /* XXX figure out why I can't do let old = ... and then summarize... = old(); */
  summarizeMultipleSelection = function (aSelectedMessages) {
    if (aSelectedMessages.length == 0)
      return;
    try {
      /* Remove this when bug 538750 is fixed. And bump the version requirement
       * in install.rdf.template */
      /* ------ cut here ----- */
      let threadKeys = [
        gDBView.getThreadContainingIndex(i).getChildHdrAt(0).messageKey
        for each ([, i] in Iterator(gFolderDisplay.selectedIndices))
      ];
      let isSameThread = threadKeys.every(function (x) x == threadKeys[0]);
      if (isSameThread) {
      /* ------ end cut here ----- */
        summarizeThread(aSelectedMessages);
      /* ------ cut here ----- */
      } else {
        gSummary = new MultiMessageSummary(aSelectedMessages);
        gSummary.init();
        document.getElementById('multimessage').contentWindow.disableExtraButtons();
        gconversation.stash.multiple_selection = true;
      }
      /* ------ end cut here ----- */
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
      let htmlpane = document.getElementById('multimessage');
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
            let htmlpane = document.getElementById('multimessage');
            if (!gPrefs["disable_error_empty_collection"])
              htmlpane.contentWindow.errorEmptyCollection();
          }
        }
      );
    }
  };

  /* Register "print" functionnality. Now that's easy! */
  gconversation.print = function () {
    if (gconversation.stash.multiple_selection) {
      document.getElementById("multimessage").contentWindow.print();
    } else {
      let w = window.open("chrome://gconversation/content/printstub.xhtml", "", "width=640,height=480,chrome");
      w.addEventListener("load", function (event) {
        let pDoc = w.document;
        let htmlpane = document.getElementById('multimessage').contentDocument;
        pDoc.getElementById("heading").textContent = htmlpane.getElementById("heading").textContent;
        for each (let [,msgNode] in Iterator(htmlpane.getElementsByClassName("message"))) {
          if (msgNode.style.display == "none")
            continue;

          let pMsgNode = pDoc.getElementsByClassName("message")[0].cloneNode(true);
          let clone = function (klass, f) {
            let node = msgNode.getElementsByClassName(klass)[0];
            let pNode = pMsgNode.getElementsByClassName(klass)[0];
            f(node, pNode);
          };
          clone("sender", function (sender, pSender) {
            pSender.textContent = sender.textContent;
            pSender.style.color = sender.style.color;
          });
          clone("date", function (node, pNode) {
            pNode.textContent = node.textContent;
          });
          clone("snippetmsg", function (snippet, pSnippet) {
            if (_mm_hasClass(pMsgNode, "collapsed")) {
              pSnippet.textContent = snippet.textContent;
              pMsgNode.getElementsByClassName("plaintextmsg")[0].style.display = "none";
            } else {
              pSnippet.style.display = "none";
            }
          });
          clone("plaintextmsg", function (msg, pMsg) {
            pMsg.textContent = msg.textContent;
          });
          pDoc.body.appendChild(pMsgNode);
        }
        let stub = pDoc.getElementsByClassName("message")[0];
        stub.parentNode.removeChild(stub);
        setTimeout(function () w.print(), 0);
      }, true);
    }
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
      msgHdrsArchive(gconversation.stash.msgHdrs, window);
  };

  gconversation.delete_all = function () {
    if (gconversation.stash.multiple_selection)
      msgHdrsDelete(gFolderDisplay.selectedMessages);
    else
      msgHdrsDelete(gconversation.stash.msgHdrs);
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
        function (aCollection, aItems, aMsg) {
          if (aCollection) {
            let items = groupMessages(aCollection.items);
            if (items.length <= 1)
              return;
            let rightMessages = [selectRightMessage(x, gDBView.msgFolder) for each ([, x] in Iterator(items))];
            rightMessages = rightMessages.filter(function (x) x);
            rightMessages = rightMessages.map(function (x) x.folderMessage);
            let gSummary = new ThreadSummary(rightMessages, null);
            gMessageDisplay.singleMessageDisplay = false;
            try {
              gSummary.init();
            } catch (e) {
              myDump("!!! "+e+"\n");
              throw e;
            }
            return;
          }
      });

    },
    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsISupportsWeakReference, Ci.nsIWebProgressListener])
  };
  messagepane.addProgressListener(gconversation.stash.uriWatcher);

  myDump("*** gConversation loaded\n");

}, true);
