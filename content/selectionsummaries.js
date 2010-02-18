/* This file modifies threadsummaries.js by overriding a large part of the
 * original code (mainly ThreadSummary.summarize). Our functions are the result
 * of incremental modifications to the original ones, so that we can backport
 * the changes from main Thunderbird code more easily.
 *
 * Original comments are C++-style, mine are C-style.
 *
 * The Original Code is multiple message preview pane
 *
 * The Initial Developer of the Original Code is
 *   Mozilla Messaging
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   David Ascher <dascher@mozillamessaging.com>
 *   Jonathan Protzenko <jonathan.protzenko@gmail.com>
 *
 * */

/* That's for event handlers */
var gconversation = {
  on_load_thread: null,
  on_load_thread_tab: null,
  mark_all_read: null
};

var gMsgHdrs;

/* That's for global namespace pollution + because we need the document's
 * <stringbundle> to be accessible. */
document.addEventListener("load", function () {
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cu = Components.utils;
  Components.utils.import("resource://gconversation/MailUtils.jsm");

  /* Various magic values */
  const nsMsgViewIndex_None = 0xffffffff;
  const kCharsetFromMetaTag = 10;

  const gPrefBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch(null);
  const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("gconversation.");
  const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);
  const stringBundle = document.getElementById("gconv-string-bundle");


  /* Preferences are loaded once and then observed. For a new pref, add an entry
   * here + a case in the switch below. */
  let g_prefs = {};
  g_prefs["monospaced"] = prefs.getBoolPref("monospaced");
  g_prefs["focus_first"] = prefs.getBoolPref("focus_first");
  g_prefs["html"] = prefs.getBoolPref("html");
  g_prefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
  g_prefs["fold_rule"] = prefs.getCharPref("fold_rule");
  g_prefs["reverse_order"] = prefs.getBoolPref("reverse_order");

  let myPrefObserver = {
    register: function () {
      prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
      prefs.addObserver("", this, false);
    },

    unregister: function () {
      if (!prefs) return;
        prefs.removeObserver("", this);
    },

    observe: function (aSubject, aTopic, aData) {
      if (aTopic != "nsPref:changed") return;
      switch (aData) {
        case "monospaced":
        case "focus_first":
        case "html":
        case "reverse_order":
          g_prefs[aData] = prefs.getBoolPref(aData);
          break;
        case "hide_quote_length":
          g_prefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
          break;
        case "fold_rule":
          g_prefs["fold_rule"] = prefs.getIntPref("fold_rule");
          break;
      }
    }
  };
  myPrefObserver.register();

  /* Actually we don't need to change the constructor, only members */
  ThreadSummary.prototype = {
    __proto__: MultiMessageSummary.prototype,

    summarize: function() {
      /* We need to keep them at hand for the "Mark all read" command to work
       * properly */
      gMsgHdrs = this._msgHdrs;

      /* This function returns a fresh color everytime it is called. After some
       * time, it starts inventing new colors of its own. */
      const predefinedColors = ["#204a87", "#5c3566", "#8f5902", "#a40000", "#c4a000", "#4e9a06", "#ce5c00"]; 
      let gColorCount = 0;
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

      this._msgNodes = {};

      let htmlpane = document.getElementById('multimessage');
      /*htmlpane.addEventListener("scroll", function (event) {
        dump(event.target+"\n");
      }, true);*/

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
      let headerParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
      let count = 0;
      const MAX_THREADS = 100;
      const SNIPPET_LENGTH = 300;
      let maxCountExceeded = false;
      let id2color = {};

      /* Determine which message is going to be focused */
      let needsFocus = -1;
      if (g_prefs["focus_first"]) {
        needsFocus = numMessages - 1;
        for (let i = 0; i < numMessages; ++i) {
          if (!this._msgHdrs[i].isRead) {
            needsFocus = i;
            break;
          }
        }
      }
      dump("needsFocus "+needsFocus+"\n");
      let msgHdrs = this._msgHdrs;
      let msgNodes = this._msgNodes;
      let scrollAfterReflow = needsFocus > 0 ? function () {
          let tKey = msgHdrs[needsFocus].messageKey + msgHdrs[needsFocus].folder.URI;
          /* Because of the header that hides the beginning of the message,
           * scroll a bit more */
          dump("Scrolling to the message from "+msgHdrs[needsFocus].mime2DecodedAuthor+"\n");
          let h = document.getElementById("multimessage")
            .contentDocument.getElementById("headingwrappertable")
            .getBoundingClientRect().height;
          document.getElementById("multimessage").contentWindow.scrollTo(0, msgNodes[tKey].offsetTop - 5);
      } : function () {};

      /* For each message, once the message has been properly set up in the
       * conversation view (either folded or unfolded), this function is called.
       * When all the messages have been filled, it scrolls to the one we want.
       * That way, no more reflows after we have scrolled to the right message. */
      let nMessagesDone = numMessages;
      function messageDone() {
        nMessagesDone--;
        if (nMessagesDone == 0) {
          dump("All messages are properly loaded, scrolling...\n");
          scrollAfterReflow();
        }
      }

      for (let i = 0; i < numMessages; ++i) {
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }

        let msgHdr = this._msgHdrs[i];

        let msg_classes = "message ";
        if (!msgHdr.isRead)
          msg_classes += " unread";
        if (msgHdr.isFlagged)
          msg_classes += " starred";

        let senderName = headerParser.extractHeaderAddressName(msgHdr.mime2DecodedAuthor);
        let date = makeFriendlyDateAgo(new Date(msgHdr.date/1000));

        /* The snippet class really has a counter-intuitive name but that allows
         * us to keep the style from the original multimessageview.css without
         * rewriting everything */
        let replyTxt = stringBundle.getString("reply");
        let replyAllTxt = stringBundle.getString("reply_all");
        let forwardTxt = stringBundle.getString("forward");
        let replyList = stringBundle.getString("reply_list");
        let editNew = stringBundle.getString("edit_new");
        let msgContents = <div class="row">
                            <div class="star"/>
                            <div class="header">
                              <div class="wrappedsender">
                                <div class="sender link">{senderName}</div>
                                <div class="date">{date}</div>
                                <div class="tags"></div>
                                <div class="attachment" style="display: none">
                                  <img src="chrome://messenger/skin/icons/attachment-col.png" />
                                </div>
                                <div class="toggle-font link"><img src="chrome://gconversation/skin/font.png" /></div>
                              </div>
                              <div class="snippet snippetmsg"></div>
                              <div class="snippet fullmsg" style="display: none"></div>
                              <div xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" class="snippet htmlmsg" style="display: none"></div>
                              <div class="fastreply">
                                <span class="fastlink link-reply">{replyTxt}</span> - 
                                <span class="fastlink link-reply-all">{replyAllTxt}</span> - 
                                <span class="fastlink link-forward">{forwardTxt}</span>
                                <span class="fastlink link-more">...</span>
                                <span style="display: none;">
                                  -
                                  <span class="fastlink link-reply-list">{replyList}</span> -
                                  <span class="fastlink link-edit-new">{editNew}</span>
                                </span>
                              </div>
                            </div>
                          </div>;

        let msgExtraContents = <div class="messagearrow">
                                 <img class="msgarrow" src="chrome://gconversation/skin/down.png" />
                               </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();
        msgNode.innerHTML += msgExtraContents.toXMLString();
        msg_classes += " "+i;
        _mm_addClass(msgNode, msg_classes);
        if (g_prefs["reverse_order"]) {
          messagesElt.insertBefore(msgNode, messagesElt.firstChild);
        } else {
          messagesElt.appendChild(msgNode);
        }

        let senderNode = msgNode.getElementsByClassName("sender")[0];
        if (id2color[senderNode.textContent])
          senderNode.style.color = id2color[senderNode.textContent];
        else
          senderNode.style.color = id2color[senderNode.textContent] = newColor();

        let fullMsgNode = msgNode.getElementsByClassName("fullmsg")[0];
        let htmlMsgNode = msgNode.getElementsByClassName("htmlmsg")[0];
        let snippetMsgNode = msgNode.getElementsByClassName("snippetmsg")[0];
        let arrowNode = msgNode.getElementsByClassName("msgarrow")[0];
        let toggleFontNode = msgNode.getElementsByClassName("toggle-font")[0];

        /* Style according to the preferences. Preferences have an observer, see
         * above for details. */
        if (g_prefs["monospaced"])
          _mm_addClass(fullMsgNode, "monospaced-message");
        if (    (g_prefs["fold_rule"] == "unread_and_last" && (!msgHdr.isRead || i == (numMessages - 1)))
             || (g_prefs["fold_rule"] == "all")) {
          snippetMsgNode.style.display = "none";
          fullMsgNode.style.display = "block";
          htmlMsgNode.style.display = "block";
          arrowNode.setAttribute("src", "chrome://gconversation/skin/up.png");
        } 
        arrowNode.addEventListener("click", function (event) htmlpane.contentWindow.toggleMessage(event), true);
        
        /* Add an event listener for the button that toggles the style of the
         * font. This will be hidden later if we want and find a suitable HTML
         * message for display. */
        toggleFontNode.addEventListener("click", function (event) _mm_toggleClass(fullMsgNode, "monospaced-message"), true);

        let key = msgHdr.messageKey + msgHdr.folder.URI;
        /* Fill the current message's node based on given parameters.
         * @param snippet
         *        the text that's displayed when the message is folded
         * @param body
         *        the plain/text body that will be processed to proper HTML
         * @param author
         *        (can be left out) a more refined version of the author's name
         *        but anyway meta.author is always empty so that's pretty much
         *        useless
         */ 
        let fillSnippetAndMsg = function (snippet, body, author) {
          if (author)
            senderNode.textContent = author;
          snippetMsgNode.textContent = snippet;

          /* Deal with the message's body
             First remove leading new lines */
          let j = 0;
          while (j < body.length && (body[j] == "\r" || body[j] == "\n"))
            ++j;
          body = body.substr(j, body.length - j);
          /* Then remove trailing new lines */
          j = body.length;
          while (j > 0 && (body[j-1] == "\r" || body[j-1] == "\n"))
            --j;
          body = body.substr(0, j);

          /* Iterate over the lines, feeding them in buf, and then calling
           * either flushBufQuote when leaving a quoted section, or
           * flushBufRegular when leaving a regular text section. The small
           * bufffer in buf is .join("\n")'d and goes to gbuf. We keep track
           * of indices to optimize array accesses. */
          let whatToDo = txttohtmlconv.kEntities + txttohtmlconv.kURLs
            + txttohtmlconv.kGlyphSubstitution 
            + txttohtmlconv.kStructPhrase; 
          let lines = body.split(/\r?\n|\r/g);
          let gbuf = [];
          let buf = [];
          let buf_j = 0;
          let gbuf_j = 0;
          /* When leaving a quoted section, this function is called. It adds
           * the - show quoted text - link and hides the quote if relevant */
          let flushBufQuote = function() {
            if (!buf.length)
              return;
            let divAttr = "";
            if (buf.length > g_prefs["hide_quote_length"]) {
              divAttr = "style=\"display: none;\"";
              let showquotedtext = stringBundle.getString("showquotedtext");
              let link = "<div class=\"link showhidequote\""+
                " onclick=\"toggleQuote(event);\">- "+showquotedtext+" -</div>";
              gbuf[gbuf_j++] = link;
            }
            gbuf[gbuf_j++] = "<div "+divAttr+">"+buf.join("<br />")+"</div>";
            buf = [];
            buf_j = 0;
          };
          /* This just flushes the buffer when changing sections */
          let flushBufRegular = function () {
            gbuf[gbuf_j++] = buf.join("<br />");
            buf = [];
            buf_j = 0;
          };
          let mode = 0; /* 0 = normal, 1 = in quote */
          for each (let [, line] in Iterator(lines)) {
            let p = Object();
            /* citeLevelTXT returns 0 on string ">"... which happens to be
            quite common (it's simply a new line) so we add a space to make
            sure that citeLevelTXT returns 1 on such a string */
            let quote = txttohtmlconv.citeLevelTXT(line+" ", p);
            let html = txttohtmlconv.scanTXT(line, whatToDo);
            if (quote > 0) {
              if (mode == 0)
                flushBufRegular();
              mode = 1;
            } else {
              if (mode == 1)
                flushBufQuote();
              mode = 0;
            }
            buf[buf_j++] = html;
          }
          if (mode == 1)
            flushBufQuote();
          else
            flushBufRegular();

          /* Sometimes fails with weird Unicode characters, find a way to strip
           * them off. */
          try {
            fullMsgNode.innerHTML += gbuf.join("");
          } catch (e) {
            fullMsgNode.innerHTML = "An error has occured, we are unable to display this message.<br />"+
              "Please report this as a bug";
          }

          /* Attach the required event handlers so that links open in the
           * external browser */
          for each (let [, a] in Iterator(fullMsgNode.getElementsByTagName("a"))) {
            a.addEventListener("click", function (event) {
                return specialTabs.siteClickHandler(event, /^mailto:/);
              }, true);
          }

          /* Remove the unused node, as it makes UI JS simpler in
           * multimessageview.xhtml */
          htmlMsgNode.parentNode.removeChild(htmlMsgNode);

          messageDone();
        };
        /* Same thing but for HTML messages. The HTML is heavily processed to
         * detect extra quoted parts using different heuristics, the "- show/hide
         * quoted text -" links are added. */
        let fillSnippetAndHTML = function (snippet, html, author) {
          if (author)
            senderNode.textContent = author;
          snippetMsgNode.textContent = snippet;
          let originalScroll; /* This is shared by multiple event listeners below */

          let iframe = htmlpane.contentDocument.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "iframe");
          iframe.setAttribute("style", "height: 20px");
          iframe.setAttribute("type", "content");
          iframe.addEventListener("load", function () { dump("load event on the iframe for "+senderName+"\n"); }, true);
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
              iframe.addEventListener("load", function f_temp(event) {
                  iframe.removeEventListener("load", f_temp, true);

                  let fixMargins = function () {
                    iframe.contentDocument.body.style.padding = "0";
                    iframe.contentDocument.body.style.margin = "0";
                    iframe.contentDocument.body.style.fontSize = "small";
                  };
                  let extraFormatting = function (aDoc) {
                    /* Launch various heuristics to convert most common quoting styles
                     * to real blockquotes. */
                    convertOutlookQuotingToBlockquote(aDoc);
                    convertHotmailQuotingToBlockquote1(aDoc);
                    convertHotmailQuotingToBlockquote2(aDoc, g_prefs["hide_quote_length"]);
                    convertForwardedToBlockquote(aDoc);
                    /* This function adds a show/hide quoted text link to every topmost
                     * blockquote. Nested blockquotes are not taken into account. */
                    let walk = function (elt) {
                      for (let i = elt.childNodes.length - 1; i >= 0; --i) {
                        let c = elt.childNodes[i];
                        /* GMail uses class="gmail_quote", other MUA use type="cite"...
                         * so just search for a regular blockquote */
                        if (c.tagName && c.tagName.toLowerCase() == "blockquote") {
                          if (c.getUserData("hideme") !== false) { /* null is ok, true is ok too */
                            let div = aDoc.createElement("div");
                            div.setAttribute("class", "link showhidequote");
                            div.addEventListener("click", function(event) {
                                let h = htmlpane.contentWindow.toggleQuote(event);
                                iframe.style.height = (parseInt(iframe.style.height) + h)+"px";
                              }, true);
                            //div.setAttribute("onclick", "toggleQuote(event);");
                            div.setAttribute("style", "color: #512a45; cursor: pointer;");
                            div.appendChild(document.createTextNode("- "+
                              stringBundle.getString("showquotedtext")+" -"));
                            elt.insertBefore(div, c);
                            c.style.display = "none";
                          }
                        } else {
                          walk(c);
                        }
                      }
                    };
                    walk(aDoc);
                  };

                  /* The load event is bubbling up : now the message is loaded
                   * so we can fiddle with it safely. */
                  fixMargins();
                  extraFormatting(iframe.contentDocument);
                  iframe.style.height = iframe.contentDocument.body.scrollHeight+"px";

                  /* Attach the required event handlers so that links open in the
                   * external browser */
                  for each (let [, a] in Iterator(iframe.contentDocument.getElementsByTagName("a"))) {
                    a.addEventListener("click", function (event) specialTabs.siteClickHandler(event, /^mailto:/), true);
                  }

                  /* Remove the unused node, as it makes UI JS simpler in
                   * multimessageview.xhtml */
                  fullMsgNode.parentNode.removeChild(fullMsgNode);

                  /* Sometimes setting the iframe's content and height changes
                   * the scroll value */
                  dump("Restoring "+originalScroll+"\n");
                  htmlpane.contentDocument.documentElement.scrollTop = originalScroll;
                  
                  /* If it's an immediate display, fire the messageDone event
                   * now (we're done with the iframe). If we're delayed, the
                   * code that attached the event listener on the "click" event
                   * has already fired the messageDone event, so don't do it. */
                  if (htmlMsgNode.style.display != "none")
                    messageDone();

                  /* Here ends the chain of event listener, nothing happens
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
              let uri = msgHdr.folder.getUriForMsg(msgHdr);
              let neckoURL = {};
              let msgService = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger).messageServiceFromURI(uri);
              msgService.GetUrlForUri(uri, neckoURL, null);

              /* FIXME check on #maildev ?header=quotebody is the best way to do that */
              let cv = iframe.docShell.contentViewer;
              cv.QueryInterface(Ci.nsIMarkupDocumentViewer);
              cv.hintCharacterSet = "UTF-8";
              cv.hintCharacterSetSource = kCharsetFromMetaTag;
              iframe.docShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;
              iframe.webNavigation.loadURI(neckoURL.value.spec+"?header=quotebody", iframe.webNavigation.LOAD_FLAGS_IS_LINK, null, null, null);
            }, true); /* end document.addEventListener */

          if (htmlMsgNode.style.display != "none") {
            /* We can proceed as the xul:iframe is visible. */
            htmlMsgNode.appendChild(iframe);
          } else {
            /* Beware, the xul:iframe is not visible so we might no have a
             * docShell in some very wicked cases. We need to start working
             * after the xul:iframe has been made visible. */
            arrowNode.addEventListener("click", function f_temp3 () {
                arrowNode.removeEventListener("click", f_temp3, true);
                originalScroll = htmlpane.contentDocument.documentElement.scrollTop;
                dump("Saving scroll "+originalScroll+"\n");
                htmlMsgNode.appendChild(iframe);
              }, true);
            /* Well, nothing will happen in the load process after that, so no
             * more reflows for this message -> the message is done. */
            messageDone();
          }
        };
        try {
          /* throw { result: Components.results.NS_ERROR_FAILURE }; */
          MsgHdrToMimeMessage(msgHdr, null, function(aMsgHdr, aMimeMsg) {
            if (aMimeMsg == null) // shouldn't happen, but sometimes does?
              return;
            let [snippet, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, SNIPPET_LENGTH);
            let body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
            let hasAttachment = MimeMessageHasAttachment(aMimeMsg);
            if (hasAttachment)
              msgNode.getElementsByClassName("attachment")[0].style.display = "";

            let [hasHtml, html] = MimeMessageToHTML(aMimeMsg);
            if (hasHtml && g_prefs["html"]) {
              fillSnippetAndHTML(snippet, html, meta.author);
              toggleFontNode.style.display = "none";
            } else {
              fillSnippetAndMsg(snippet, body, meta.author);
            }
          });
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          try {
            // Offline messages generate exceptions, which is unfortunate.  When
            // that's fixed, this code should adapt. XXX
            /* --> Try to deal with that. We don't try to get an HTML email, we
             * just fallback to a regular plain/text version of it. */
            let body = getMessageBody(msgHdr, true);
            let snippet = body.substring(0, SNIPPET_LENGTH-3)+"...";
            fillSnippetAndMsg(snippet, body);
            dump("Got an \"offline message\"\n");
          } catch (e) {
            Application.console.log("Error fetching the message: "+e);
            /* Ok, that failed too... */
            fullMsgNode.textContent = "...";
            snippetMsgNode.textContent = "...";
          }
        }
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
          /* msgHdr is "the right message" (we pre-selected message before
           * giving them to the ThreadSummary) */
          let viewIndex = gFolderDisplay.view.getViewIndexForMsgHdr(this.msgHdr);
          if (viewIndex != nsMsgViewIndex_None) {
            gFolderDisplay.selectMessage(this.msgHdr);
            return;
          }

          /* msgHdr is still the best candidate for "the message we want" */
          /* selectFolder doesn't work somestimes, issue fixed in Lanikai as of 2010-01-05, see bug 536042 */
          gFolderTreeView.selectFolder(this.folder, true); 
          gFolderDisplay.selectMessage(this.msgHdr);
        }, true);

        /* The reply, reply to all, forward links. For reference, start reading
         * http://mxr.mozilla.org/comm-central/source/mail/base/content/messageWindow.js#949
         * and follow the function definitions. */
        let uri = msgHdr.folder.getUriForMsg(msgHdr);
        dump("Uri of the message: "+uri+"\n");
        let compose = function (aCompType, aEvent) {
          if (aEvent.shiftKey) {
            ComposeMessage(aCompType, Ci.nsIMsgCompFormat.OppositeOfDefault, msgHdr.folder, [uri]);
          } else {
            ComposeMessage(aCompType, Ci.nsIMsgCompFormat.Default, msgHdr.folder, [uri]);
          }
        };
        let linkReply = msgNode.getElementsByClassName("link-reply")[0];
        linkReply.addEventListener("click", function (event) {
            /* XXX this code should adapt when news messages have a JS
             * representation. See
             * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailWindowOverlay.js#1259
             * */
            compose(Ci.nsIMsgCompType.ReplyToSender, event);
          }, true);
        let linkReplyAll = msgNode.getElementsByClassName("link-reply-all")[0];
        linkReplyAll.addEventListener("click", function (event) {
            compose(Ci.nsIMsgCompType.ReplyAll, event);
          }, true);
        let linkReplyList = msgNode.getElementsByClassName("link-reply-list")[0];
        linkReplyList.addEventListener("click", function (event) {
            compose(Ci.nsIMsgCompType.ReplyToList, event);
          }, true);
        let linkEditNew = msgNode.getElementsByClassName("link-edit-new")[0];
        linkEditNew.addEventListener("click", function (event) {
            compose(Ci.nsIMsgCompType.Template, event);
          }, true);
        let linkForward = msgNode.getElementsByClassName("link-forward")[0];
        linkForward.addEventListener("click", function (event) {
            let forwardType = 0;
            try {
              forwardType = gPrefBranch.getIntPref("mail.forward_message_mode");
            } catch (e) {
              dump("Unable to fetch preferred forward mode\n");
            }
            if (forwardType == 0)
              compose(Ci.nsIMsgCompType.ForwardAsAttachment, event);
            else
              compose(Ci.nsIMsgCompType.ForwardInline, event);
          }, true);
        let linkMore = msgNode.getElementsByClassName("link-more")[0];
        linkMore.addEventListener("click", function (event) {
            event.target.style.display = "none";
            event.target.nextElementSibling.style.display = "";
          }, true);

        this._msgNodes[key] = msgNode;
      }
      // stash somewhere so it doesn't get GC'ed
      this._glodaQueries.push(
        Gloda.getMessageCollectionForHeaders(this._msgHdrs, this));
      this.notifyMaxCountExceeded(htmlpane.contentDocument, numMessages, MAX_THREADS);

      this.computeSize(htmlpane);
      htmlpane.contentDocument.defaultView.adjustHeadingSize();
      dump("--- End ThreadSummary::summarize\n\n");
    }
  };

  /* This function is the core search function. It pulls a GMail-like
   * conversation from messages aSelectedMessages, then calls k when the
   * messages have all been found */
  function pullConversation(aSelectedMessages, k) {
    try {
      q1 = Gloda.getMessageCollectionForHeaders(aSelectedMessages, {
        onItemsAdded: function (aItems) {
          let msg = aItems[0];
          //FIXME do something better...
          if (!msg)
            return;
          /*let query = Gloda.newQuery(Gloda.NOUN_MESSAGE)
          query.conversation(msg.conversation);
          //query.getCollection({*/
          q2 = msg.conversation.getMessagesCollection({
            onItemsAdded: function (aItems) {
            },
            onItemsModified: function () {},
            onItemsRemoved: function () {},
            onQueryCompleted: function (aCollection) k(aCollection, msg),
          }, true);
        },
        onItemsModified: function () {},
        onItemsRemoved: function () {}, onQueryCompleted: function (aCollection) {
        },
      }, true);
    } catch (e) {
      dump("Exception in summarizeThread" + e + "\n");
      logException(e);
      Components.utils.reportError(e);
      throw(e);
    }
  }

  /* The summarizeThread function overwrites the default one, searches for more
   * messages, and passes them to our instance of ThreadSummary. This design is
   * more convenient as it follows Thunderbird's more closely, which allows me
   * to track changes to the ThreadSummary code in Thunderbird more easily. */
  var q1, q2;
  summarizeThread = function(aSelectedMessages, aListener, aSwitchMessageDisplay) {
    if (aSelectedMessages.length == 0) {
      dump("No selected messages\n");
      return false;
    }
    document.getElementById('multimessage').contentWindow.enableExtraButtons();

    pullConversation(
      aSelectedMessages,
      function (aCollection) {
        gSummary = new ThreadSummary(
          [selectRightMessage(x, gDBView.msgFolder).folderMessage for each (x in removeDuplicates(aCollection.items))],
          aListener
        );
        gSummary.init();
        if (aSwitchMessageDisplay)
          gMessageDisplay.singleMessageDisplay = false;
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
      }
      /* ------ end cut here ----- */
    } catch (e) {
      dump("Exception in summarizeMultipleSelection" + e + "\n");
      Components.utils.reportError(e);
      throw(e);
    }
  };

  /* Register event handlers through the global variable */
  gconversation.on_load_thread = function() {
    summarizeThread(gFolderDisplay.selectedMessages, null, true);
  };
  gconversation.on_load_thread_tab = function() {
    if (!gFolderDisplay.selectedMessages.length)
      return;

    pullConversation(
      gFolderDisplay.selectedMessages,
      function (aCollection, aMsg) {
        let tabmail = document.getElementById("tabmail");
        aCollection.items = [selectRightMessage(m) for each (m in removeDuplicates(aCollection.items))];
        tabmail.openTab("glodaList", {
          collection: aCollection,
          message: aMsg,
          title: aMsg.subject,
          background: false
        });
      }
    );
  };

  /* Register "print" functionnality */
  gconversation.print = function () {
    document.getElementById("multimessage").contentWindow.print();
  };

  /* The button as well as the menu item are hidden and disabled respectively
   * when we're viewing a MultiMessageSummary, so fear not marking wrong
   * messages as read. */
  gconversation.mark_all_read = function () {
    let pending = {};
    for each (msgHdr in gMsgHdrs) {
      if (msgHdr.isRead)
        continue;
      if (!pending[msgHdr.folder.URI]) {
        pending[msgHdr.folder.URI] = {
          folder: msgHdr.folder,
          msgs: Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray)
        };
      }
      pending[msgHdr.folder.URI].msgs.appendElement(msgHdr, false);
    }
    for each (let { folder, msgs } in pending) {
      folder.markMessagesRead(msgs, true);
      folder.msgDatabase = null; /* don't leak */
    }
  };

  /* We need to attach our custom context menu to multimessage, that's simpler
   * than using an overlay. */
  document.getElementById("multimessage").setAttribute("context", "gConvMenu");

}, true);
