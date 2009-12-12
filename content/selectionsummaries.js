var gconversation = {
  on_load_thread: null,
  on_load_thread_tab: null
};

(function () {
  const nsMsgViewIndex_None = 0xffffffff;

  /* Some functions useful for us */
  function getMessageBody(aMessageHeader) {  
    let messenger = Components.classes["@mozilla.org/messenger;1"].createInstance(Components.interfaces.nsIMessenger);  
    let listener = Components.classes["@mozilla.org/network/sync-stream-listener;1"]
                             .createInstance(Components.interfaces.nsISyncStreamListener);  
    let uri = aMessageHeader.folder.getUriForMsg(aMessageHeader);  
    messenger.messageServiceFromURI(uri).streamMessage(uri, listener, null, null, false, "");  
    let folder = aMessageHeader.folder;  
    return folder.getMsgTextFromStream(listener.inputStream, aMessageHeader.Charset, 65536, 32768, false, true, { });  
  }  

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

      let headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                                      .getService(Components.interfaces.nsIMsgHeaderParser);
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
                              <div class="snippet"></div>
                            </div>
                          </div>;

        let msgNode = htmlpane.contentDocument.createElement("div");
        // innerHTML is safe here because all of the data in msgContents is
        // either generated from integers or escaped to be safe.
        msgNode.innerHTML = msgContents.toXMLString();
        _mm_addClass(msgNode, msg_classes);
        messagesElt.appendChild(msgNode);

        let key = msgHdr.messageKey + msgHdr.folder.URI;
        let snippetNode = msgNode.getElementsByClassName("snippet")[0];
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
            while (body[0] == "\r" || body[0] == "\n")
              body = body.substr(1, body.length - 1);
            body = body.replace(/[<]/g, '&lt;').replace(/[>]/g, '&gt;');
            snippetNode.innerHTML = nl2br(body);
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
           * Smart Folder "Inbox" to a specific Inbox, which is bad */
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
      return;
    }

    pullConversation(
      aSelectedMessages,
      function (aCollection) {
        gSummary = new ThreadSummary([item.folderMessage for each (item in removeDuplicates(aCollection.items))]);
        gSummary.init();
        return;
      }
    );
  };

  /* Register event handlers through the global variable */
  gconversation.on_load_thread = function() {
    summarizeThread(gFolderDisplay.selectedMessages);
    gMessageDisplay.singleMessageDisplay = false;
  };
  gconversation.on_load_thread_tab = function() {
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
