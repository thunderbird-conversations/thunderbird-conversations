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

      let firstMsgHdr = this._msgHdrs[0];
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
        let msgHdr = this._msgHdrs[i];

        let msg_classes = "message ";
        if (!msgHdr.isRead)
          msg_classes += " unread";
        if (msgHdr.isFlagged)
          msg_classes += " starred";

        let senderName = headerParser.extractHeaderAddressName(msgHdr.mime2DecodedAuthor);
        let date = makeFriendlyDateAgo(new Date(msgHdr.date/1000));

        /* the snippet class really has a counter-intuitive name but that allows
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

        /* Style according to the preferences */
        if (prefs.getBoolPref("monospaced"))
          fullMsgNode.style.fontFamily = "-moz-fixed";
        let fold_rule = prefs.getCharPref("fold_rule");
        if ((fold_rule == "unread_and_last" && (!msgHdr.isRead || i == (numMessages - 1)))
             || fold_rule == "all") {
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
            //remove leading new lines
            let i = 0;
            while (i < body.length && (body[i] == "\r" || body[i] == "\n"))
              ++i;
            body = body.substr(i, body.length - i);
            //remove trailing new lines
            i = body.length;
            while (i > 0 && (body[i-1] == "\r" || body[i-1] == "\n"))
              --i;
            body = body.substr(0, i);

            let whatToDo = txttohtmlconv.kEntities + txttohtmlconv.kURLs
              + txttohtmlconv.kGlyphSubstitution 
              + txttohtmlconv.kStructPhrase; 
            //XXX find a more efficient way to do that
            let lines = body.split(/\r?\n|\r/g);
            let buf = [];
            /* When leaving a quoted section, this function is called. It adds
             * the - show quoted text - link and hides the quote if relevant */
            let hide_quote_length = prefs.getIntPref("hide_quote_length");
            let flushBuf = function() {
              if (!buf.length)
                return;
              buf.reverse();
              let div = htmlpane.contentDocument.createElement("div");
              div.innerHTML = buf.join("<br />");
              if (buf.length > hide_quote_length) {
                div.style.display = "none";
                let link = htmlpane.contentDocument.createElement("div");
                link.textContent = "- show quoted text -";
                _mm_addClass(link, "link");
                _mm_addClass(link, "showhidequote");
                link.setAttribute("onclick", "toggleQuote(event);");
                fullMsgNode.appendChild(link);
              }
              buf = [];
              fullMsgNode.appendChild(div);
            };
            dump("\n");
            for each (let [, line] in Iterator(lines)) {
              dump("\r"+k+"/"+lines.length);
              let line = lines[k];
              let p = Object();
              /* citeLevelTXT returns 0 on string ">"... which happens to be
              quite common (it's simply a new line) so we add a space to make
              sure that citeLevelTXT returns 1 on such a string */
              let quote = txttohtmlconv.citeLevelTXT(line+" ", p);
              let html = txttohtmlconv.scanTXT(line, whatToDo);
              //dump(quote+" "+line+"\n");
              if (quote > 0) {
                buf.unshift(html);
              } else {
                flushBuf();
                fullMsgNode.innerHTML += html;
                fullMsgNode.innerHTML += "<br />";
              }
            }
            dump("\n");
            flushBuf();
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
        sender.addEventListener("click", function(e) {
          // if the msg is the first message in a collapsed thread, we need to
          // uncollapse it.
          /*let origRowCount = gDBView.rowCount;
          gDBView.selectFolderMsgByKey(this.folder, this.msgKey);
          if (gDBView.rowCount != origRowCount)
            gDBView.selectionChanged();*/

          /* If we already have the message in the current view, then it's not
           * necessary to change folders (otherwise, we would change from the
           * Smart Folder "Inbox" to a specific Inbox, which is bad) */
          let viewIndex = gDBView.findIndexOfMsgHdr(e.target.msgHdr, true);
          if (viewIndex == nsMsgViewIndex_None) {
            gFolderTreeView.selectFolder(this.folder); //issue here see bug #10
          }
          gFolderDisplay.selectMessage(this.msgHdr);
        }, true);

        this._msgNodes[key] = msgNode;

        messagesElt.appendChild(msgNode);
      }
      // stash somewhere so it doesn't get GC'ed
      this._glodaQueries.push(Gloda.getMessageCollectionForHeaders(this._msgHdrs, this));
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
        onItemsRemoved: function () {},
        onQueryCompleted: function (aCollection) {
        },
      }, true);
    } catch (e) {
      dump("Exception in summarizeThread" + e + "\n");
      logException(e);
      Components.utils.reportError(e);
      throw(e);
    }
  }

  /* Remove messages with the same Message-Id header from a collection */
  function removeDuplicates(items) {
    let selectedMessages = [];
    let knownMessages = {};
    for (let i = 0; i < items.length; ++i) {
      let item = items[i];
      let id = item.headerMessageID;
      if (!knownMessages[id]) {
        knownMessages[id] = true;
        selectedMessages.push(item);
      }
    }
    return selectedMessages;
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
        gSummary = new ThreadSummary([item.folderMessage for each (item in removeDuplicates(aCollection.items))]);
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
