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

  /* Some utility functions */
  function getMessageBody(aMessageHeader) {  
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
  }

  let txttohtmlconv = Cc["@mozilla.org/txttohtmlconv;1"].createInstance(Ci.mozITXTToHTMLConv);

  function nl2br(str) {
    // Converts newlines to HTML line breaks  
    // 
    // version: 911.1619
    // discuss at: http://phpjs.org/functions/nl2br    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Philip Peterson
    // +   improved by: Onno Marsman
    // +   improved by: Atli Þór
    // +   bugfixed by: Onno Marsman    // +      input by: Brett Zamir (http://brett-zamir.me)
    // +   bugfixed by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   improved by: Maximusya
    // *     example 1: nl2br('Kevin\nvan\nZonneveld');    // *     returns 1: 'Kevin\nvan\nZonneveld'
    // *     example 2: nl2br("\nOne\nTwo\n\nThree\n", false);
    // *     returns 2: '<br>\nOne<br>\nTwo<br>\n<br>\nThree<br>\n'
    // *     example 3: nl2br("\nOne\nTwo\n\nThree\n", true);
    // *     returns 3: '\nOne\nTwo\n\nThree\n'
 
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1<br />$2');
  }

  /* We override the usual ThreadSummary class to provide our own. Our own
   * displays full messages, plus other extra features */
  ThreadSummary = function (messages) {
    this._msgHdrs = messages;
  }

  ThreadSummary.prototype = {
    __proto__: MultiMessageSummary.prototype,

    summarize: function() {
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
      for (let i = 0; i < numMessages; ++i) {
        count += 1;
        if (count > MAX_THREADS) {
          maxCountExceeded = true;
          break;
        }
        let msgHdr = this._msgHdrs[i];

        let msg_classes = "message ";
        if (! msgHdr.isRead)
          msg_classes += " unread";
        if (msgHdr.isFlagged)
          msg_classes += " starred";

        let senderName = headerParser.extractHeaderAddressName(msgHdr.mime2DecodedAuthor);
        let date = makeFriendlyDateAgo(new Date(msgHdr.date/1000));

        let msgContents = <div class="row">
                            <div class="star"/>
                            <div class="header">
                              <div class="wrappedsender">
                                <div class="sender link">{senderName}</div>
                                <div class="date">{date}</div>
                                <div class="tags"></div>
                              </div>
                            </div>
                          </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();
        _mm_addClass(msgNode, msg_classes);
        messagesElt.appendChild(msgNode);

        let snippetNode;
        if (prefs.getBoolPref("monospaced"))
          snippetNode = htmlpane.contentDocument.createElement("pre");
        else
          snippetNode = htmlpane.contentDocument.createElement("div");
        _mm_addClass(snippetNode, "snippet");
        msgNode.getElementsByClassName("header")[0].appendChild(snippetNode);


        let key = msgHdr.messageKey + msgHdr.folder.URI;
        let senderNode = msgNode.getElementsByClassName("sender")[0];
        try {
          MsgHdrToMimeMessage(msgHdr, null, function(aMsgHdr, aMimeMsg) {
            if (aMimeMsg == null) /* shouldn't happen, but sometimes does? */ {
              return;
            }
            let [_, meta] = mimeMsgToContentAndMeta(aMimeMsg, aMsgHdr.folder, SNIPPET_LENGTH);
            if (meta.author)
              senderNode.textContent = meta.author;
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
             * the - show quoted text - link and hide the quote if relevant */
            let flushBuf = function() {
              if (!buf.length)
                return;
              let div = htmlpane.contentDocument.createElement("div");
              div.innerHTML = buf.join("<br />");
              if (buf.length > 3) {
                div.style.display = "none";
                let link = htmlpane.contentDocument.createElement("div");
                link.textContent = "- show quoted text -";
                _mm_addClass(link, "link");
                _mm_addClass(link, "showhidequote");
                link.setAttribute("onclick", "toggleQuote(event);");
                snippetNode.appendChild(link);
              }
              buf = [];
              snippetNode.appendChild(div);
            };
            for each (let [, line] in Iterator(lines)) {
              let i = Object();
              /* citeLevelTXT returns 0 on string ">"... which happens to be
              quite common (it's simply a new line) so we add a space to make
              sure that citeLevelTXT returns 1 on such a string */
              let quote = txttohtmlconv.citeLevelTXT(line+" ", i);
              let html = txttohtmlconv.scanTXT(line, whatToDo);
              //dump(quote+" "+line+"\n");
              if (quote > 0) {
                buf.push(html);
              } else {
                flushBuf();
                snippetNode.innerHTML += html;
                snippetNode.innerHTML += "<br />";
              }
            }
            flushBuf();
          });
        } catch (e if e.result == Components.results.NS_ERROR_FAILURE) {
          // Offline messages generate exceptions, which is unfortunate.  When
          // that's fixed, this code should adapt. XXX
          snippetNode.textContent = "...";
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
