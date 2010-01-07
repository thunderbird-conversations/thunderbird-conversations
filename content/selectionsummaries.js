var gconversation = {
  on_load_thread: null,
  on_load_thread_tab: null
};

(function () {
  const nsMsgViewIndex_None = 0xffffffff;
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const prefs = Cc["@mozilla.org/preferences-service;1"]
    .getService(Ci.nsIPrefService).getBranch("gconversation.");
  const txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);

  let g_prefs = {};
  g_prefs["monospaced"] = prefs.getBoolPref("monospaced");
  g_prefs["hide_quote_length"] = prefs.getIntPref("hide_quote_length");
  g_prefs["fold_rule"] = prefs.getCharPref("fold_rule");

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
          g_prefs["monospaced"] = prefs.getBoolPref("monospaced");
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

  /* Some utility functions */

  /*function getMessageBody(aMessageHeader) {  
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);  
    let listener = Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance(Ci.nsISyncStreamListener);  
    let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);  
    messenger.messageServiceFromURI(uri).streamMessage(uri, listener, null, null, false, "");  
    let folder = aMessageHeader.folder;  
    return folder.getMsgTextFromStream(listener.inputStream, aMessageHeader.Charset, 65536, 32768, false, false, { });  
  }  

  function getMessageBody2(aMsgHdr) {
    let folder = aMsgHdr.folder;
    let key = aMsgHdr.messageKey;
    if (folder.hasMsgOffline(key)) {
      let offset = new Object();
      let messageSize = new Object();
      let is;
      let bodyAndHdr;
      try {
        is = folder.getOfflineFileStream(key, offset, messageSize);
        let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
        sis.init(is);
        while (sis.available()) {
          bodyAndHdr += sis.read(2048);
        }
      } catch(e) {
        dump("getMessageBody2"+e+"\n"+e.message+"\n");
      }
      return bodyAndHdr;
    } else {
      return "";
    }
  }*/

  /* We override the usual ThreadSummary class to provide our own. Our own
   * displays full messages, plus other extra features */
  ThreadSummary = function (messages) {
    /* messages =
     *  [
     *    [GlodaMessage1, GlodaMessage2, ... (all share the same MessageId Header],
     *    [Same for 2nd message in thread]
     *  ]
     * */
    this._msgHdrs = messages;
  }

  ThreadSummary.prototype = {
    __proto__: MultiMessageSummary.prototype,

    summarize: function() {

      const predefinedColors = ["#204a87", "#5c3566", "#8f5902", "#a40000", "#c4a000", "#4e9a06", "#ce5c00"]; 
      let gColorCount = 0;
      function newColor() {
        if (gColorCount < predefinedColors.length) {
          return predefinedColors[gColorCount++];
        } else {
          let rand = function () Math.round(Math.random()*255);
          let r = rand();
          let g = rand();
          let b = rand();
          return "rgb("+r+","+g+","+b+")";
        }
      }

      this._msgNodes = {};

      let htmlpane = document.getElementById('multimessage');

      let firstMsgHdr = this._msgHdrs[0][0].folderMessage;
      let numMessages = this._msgHdrs.length;
      let subject = (firstMsgHdr.mime2DecodedSubject || gSelectionSummaryStrings["noSubject"])
         + " "
         + PluralForm.get(numMessages, gSelectionSummaryStrings["Nmessages"]).replace('#1', numMessages);
      let heading = htmlpane.contentDocument.getElementById('heading');
      heading.setAttribute("class", "heading");
      heading.textContent = subject;

      let messagesElt = htmlpane.contentDocument.getElementById('messagelist');
      while (messagesElt.firstChild)
        messagesElt.removeChild(messagesElt.firstChild);

      let headerParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
      let count = 0;
      const MAX_THREADS = 100;
      const SNIPPET_LENGTH = 300;
      let maxCountExceeded = false;
      let id2color = {};
      for (let i = 0; i < numMessages; ++i) {
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }
        let msgHdr = this._msgHdrs[i][0].folderMessage;

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
        let msgContents = <div class="row">
                            <div class="star"/>
                            <div class="header">
                              <div class="wrappedsender">
                                <div class="sender link">{senderName}</div>
                                <div class="date">{date}</div>
                                <div class="tags"></div>
                              </div>
                              <div class="snippet fullmsg" style="display: none"></div>
                              <div class="snippet snippetmsg"></div>
                            </div>
                          </div>;

        let msgExtraContents = <div class="messagearrow">
                                 <img class="msgarrow" src="chrome://gconversation/skin/down.png" onclick="toggleMessage(event);" />
                               </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();
        msgNode.innerHTML += msgExtraContents.toXMLString();
        _mm_addClass(msgNode, msg_classes);
        messagesElt.appendChild(msgNode);

        let senderNode = msgNode.getElementsByClassName("sender")[0];
        if (id2color[senderNode.textContent])
          senderNode.style.color = id2color[senderNode.textContent];
        else
          senderNode.style.color = id2color[senderNode.textContent] = newColor();

        let fullMsgNode = msgNode.getElementsByClassName("fullmsg")[0];
        let snippetMsgNode = msgNode.getElementsByClassName("snippetmsg")[0];

        /* Style according to the preferences. Preferences have an observer, see
         * above for details. */
        if (g_prefs["monospaced"])
          fullMsgNode.style.fontFamily = "-moz-fixed";
        if ((g_prefs["fold_rule"] == "unread_and_last" && (!msgHdr.isRead || i == (numMessages - 1)))
             || g_prefs["fold_rule"] == "all") {
          snippetMsgNode.style.display = "none";
          fullMsgNode.style.display = "block";
          msgNode.getElementsByClassName("msgarrow")[0].setAttribute(
            "src",
            "chrome://gconversation/skin/up.png");
        }

        let key = msgHdr.messageKey + msgHdr.folder.URI;
        try {
          MsgHdrToMimeMessage(msgHdr, null, function(aMsgHdr, aMimeMsg) {
            let j = i;
            if (aMimeMsg == null) /* shouldn't happen, but sometimes does? */ {
              return;
            }
            let [snippet, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, SNIPPET_LENGTH);
            if (meta.author)
              senderNode.textContent = meta.author;

            /* Fill the snippetmsg first */
            snippetMsgNode.textContent = snippet;

            /* Deal with the full message */
            let body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
            /* First remove leading new lines */
            let i = 0;
            while (i < body.length && (body[i] == "\r" || body[i] == "\n"))
              ++i;
            body = body.substr(i, body.length - i);
            /* Then remove trailing new lines */
            i = body.length;
            while (i > 0 && (body[i-1] == "\r" || body[i-1] == "\n"))
              --i;
            body = body.substr(0, i);

            /* Iterate over the lines, feeding them in buf, and then calling
             * either flushBufQuote when leaving a quoted section, or
             * flushBufRegular when leaving a regular text section. The small
             * bufffer in buf is .join("\n")'d and goes to gbuf. We keep track
             * of indices to optimize array accesses. */
            let whatToDo = txttohtmlconv.kEntities + txttohtmlconv.kURLs
              + txttohtmlconv.kGlyphSubstitution 
              + txttohtmlconv.kStructPhrase; 
            //XXX find a more efficient way to do that
            let lines = body.split(/\r?\n|\r/g);
            let gbuf = [];
            let buf = [];
            let buf_i = 0;
            let gbuf_i = 0;
            /* When leaving a quoted section, this function is called. It adds
             * the - show quoted text - link and hides the quote if relevant */
            let flushBufQuote = function() {
              if (!buf.length)
                return;
              let divAttr = "";
              if (buf.length > g_prefs["hide_quote_length"]) {
                divAttr = "style=\"display: none;\"";
                let link = "<div class=\"link showhidequote\""+
                  " onclick=\"toggleQuote(event);\">- show quoted text -</div>";
                gbuf[gbuf_i++] = link;
              }
              gbuf[gbuf_i++] = "<div "+divAttr+">"+buf.join("<br />")+"</div>";
              buf = [];
              buf_i = 0;
            };
            /* This just flushes the buffer when changing sections */
            let flushBufRegular = function () {
              gbuf[gbuf_i++] = buf.join("<br />");
              buf = [];
              buf_i = 0;
            };
            let mode = 0; //0 = normal, 1 = in quote
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
              buf[buf_i++] = html;
            }
            if (mode == 1)
              flushBufQuote();
            else
              flushBufRegular();
            fullMsgNode.innerHTML += gbuf.join("");

            /* Attach the required event handlers so that links open in the
             * external browser */
            for each ([, a] in Iterator(fullMsgNode.getElementsByTagName("a"))) {
              a.addEventListener("click", function (event) {
                  return specialTabs.siteClickHandler(event, /^mailto:/);
                }, true);
            }
          });
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          // Offline messages generate exceptions, which is unfortunate.  When
          // that's fixed, this code should adapt. XXX
          fullMsgNode.textContent = "...";
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

        let sender = msgNode.getElementsByClassName("sender")[0];
        sender.msgHdr = msgHdr;
        sender.folder = msgHdr.folder;
        sender.msgKey = msgHdr.messageKey;
        sender.similar = this._msgHdrs[i];
        /* There is always a value at that key. Most of time, it's [] */
        sender.addEventListener("click", function(e) {
          /* Now this._msgHdrs[i] contains a list of all messages sharing the
           * same Message-Id header. Most of the time the list will have length
           * 1, but because of GMail and its multiple-IMAP-folders policy, we
           * need to iterate until we find the nsIMsgDBHdr that matches the
           * message in the current folder. */
          for each (let msg in this.similar) {
            let msgHdr = msg.folderMessage;
            let viewIndex = gFolderDisplay.view.getViewIndexForMsgHdr(msgHdr);
            /*dump("hdr: "+viewIndex+" "+msgHdr.mime2DecodedAuthor+" ["+msgHdr.mime2DecodedSubject+"]\n");
            dump((msgHdr.folder == gDBView.msgFolder)+"\n");*/
            if (viewIndex != nsMsgViewIndex_None) {
              gFolderDisplay.selectMessage(msgHdr);
              return;
            }
          }

          /* None of this worked, let's go to the folder's message and select it. */
          // selectFolder doesn't work somestimes, issue fixed in Lanikai as of 2010-01-05, see bug 536042
          gFolderTreeView.selectFolder(this.folder, true); 
          gFolderDisplay.selectMessage(this.msgHdr);
        }, true);

        this._msgNodes[key] = msgNode;

        messagesElt.appendChild(msgNode);
      }
      // stash somewhere so it doesn't get GC'ed
      this._glodaQueries.push(
        Gloda.getMessageCollectionForHeaders([x[0].folderMessage for each (x in this._msgHdrs)], this));
      this.notifyMaxCountExceeded(htmlpane.contentDocument, numMessages, MAX_THREADS);

      this.computeSize(htmlpane);
      htmlpane.contentDocument.defaultView.adjustHeadingSize();
    }
  };

  /* This function is the core search function. It pulls a GMail-like
   * conversation from messages aSelectedMessages, then calls k when the
   * messages have all been found */
  function pullConversation(aSelectedMessages, k) {
    try {
      q1 = Gloda.getMessageCollectionForHeaders(aSelectedMessages, {
        onItemsAdded: function (aItems) {
          //FIXME this might returns zero items in case we haven't indexed anything yet
          let msg = aItems[0];
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

  /* Remove messages with the same Message-Id header from a collection.
   * Return an object with, for each message in selectedMessages, the duplicates
   * that have been found. */
  function removeDuplicates(items) {
    //let info = function (hdr) hdr.mime2DecodedAuthor+" ["+hdr.mime2DecodedSubject+"]";
    let similar = {};
    let orderedIds = [];
    for (let i = 0; i < items.length; ++i) {
      let item = items[i];
      let id = item.headerMessageID;
      if (!similar[id]) {
        similar[id] = [item];
        orderedIds.push(id);
      } else {
        similar[id].push(item);
      }
    }
    return [similar[id] for each (id in orderedIds)];
  }

  /* The summarizeThread function overwrites the default one, searches for more
   * messages, and passes them to our instance of ThreadSummary. This design is
   * more convenient as it follows Thunderbird's more closely, which allows me
   * to track changes to the ThreadSummary code in Thunderbird more easily. */
  var q1, q2;
  summarizeThread = function(aSelectedMessages) {
    if (aSelectedMessages.length == 0) {
      dump("No selected messages\n");
      return false;
    }

    pullConversation(
      aSelectedMessages,
      function (aCollection) {
        gSummary = new ThreadSummary(removeDuplicates(aCollection.items));
        gSummary.init();
        return;
      }
    );

    return true;
  };

  /* Register event handlers through the global variable */
  gconversation.on_load_thread = function() {
    if (summarizeThread(gFolderDisplay.selectedMessages))
      gMessageDisplay.singleMessageDisplay = false;
  };
  gconversation.on_load_thread_tab = function() {
    if (!gFolderDisplay.selectedMessages.length)
      return;

    pullConversation(
      gFolderDisplay.selectedMessages,
      function (aCollection, aMsg) {
        let tabmail = document.getElementById("tabmail");
        aCollection.items = removeDuplicates(aCollection.items);
        tabmail.openTab("glodaList", {
          collection: aCollection,
          message: aMsg,
          title: aMsg.subject,
          background: false
        });
      }
    );
  };

})();
