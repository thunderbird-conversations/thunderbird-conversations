var EXPORTED_SYMBOLS = ['Message', 'MessageFromGloda', 'MessageFromDbHdr']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/templateUtils.js"); // for makeFriendlyDateAgo
Cu.import("resource:///modules/gloda/mimemsg.js");
Cu.import("resource:///modules/gloda/connotent.js"); // for mimeMsgToContentSnippetAndMeta

const gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
                      .getService(Ci.nsIMsgHeaderParser);
const gMsgTagService = Cc["@mozilla.org/messenger/tagservice;1"]
                       .getService(Ci.nsIMsgTagService);
const kCharsetFromMetaTag = 10;
const kAllowRemoteContent = 2;

let strings = new StringBundle("chrome://conversations/locale/main.properties");

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/contact.js");
Cu.import("resource://conversations/hook.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Message");
const snippetLength = 300;

// Add in the global message listener table a weak reference to the given
//  Message object. The monkey-patch which intercepts the "remote content
//  blocked" notification will then look for a suitable listener on notify it of
//  the aforementioned event.
function addMsgListener(aMessage) {
  let window = getMail3Pane();
  let weakPtr = Cu.getWeakReference(aMessage);
  let msgListeners = window.Conversations.msgListeners;
  let messageId = aMessage._msgHdr.messageId;
  if (!(messageId in msgListeners))
    msgListeners[messageId] = [];
  msgListeners[messageId].push(weakPtr);
}

function KeyListener(aMessage) {
  this.message = aMessage;
  let mail3PaneWindow = getMail3Pane();
  this.KeyEvent = mail3PaneWindow.KeyEvent;
  this.navigator = mail3PaneWindow.navigator;
}

KeyListener.prototype = {
  onKeyPress: function _KeyListener_onKeyPressed (event) {
    let self = this;
    let isAccel = function (event) (
       self.navigator.platform.indexOf("mac") === 0 && event.metaKey
       || event.ctrlKey
    );
    let findMsgNode = function (msgNode) {
      let msgNodes = self.message._domNode.ownerDocument
        .getElementsByClassName(Message.prototype.cssClass);
      msgNodes = [x for each ([, x] in Iterator(msgNodes))];
      let index = msgNodes.indexOf(msgNode);
      return [msgNodes, index];
    };
    switch (event.which) {
      case this.KeyEvent.DOM_VK_RETURN:
      case 'o'.charCodeAt(0):
        this.message.toggle();
        event.preventDefault();
        break;

      case 'n'.charCodeAt(0):
        {
          let [msgNodes, index] = findMsgNode(this.message._domNode);
          if (index < msgNodes.length) {
            let next = msgNodes[index+1];
            next.focus();
            this.message._conversation._htmlPane
              .contentWindow.scrollNodeIntoView(next);
          }
          event.preventDefault();
        }
        break;

      case 'p'.charCodeAt(0):
        {
          let [msgNodes, index] = findMsgNode(this.message._domNode);
          if (index > 0) {
            let prev = msgNodes[index-1];
            prev.focus();
            this.message._conversation._htmlPane
              .contentWindow.scrollNodeIntoView(prev);
          }
          event.preventDefault();
        }
        break;

      case 'r'.charCodeAt(0):
        if (isAccel(event))
          this.message.compose(Ci.nsIMsgCompType.ReplyToSender, event);
        event.preventDefault();
        break;

      case 'R'.charCodeAt(0):
        if (isAccel(event))
          this.message.compose(Ci.nsIMsgCompType.ReplyAll, event);
        event.preventDefault();
        break;

      case 'l'.charCodeAt(0):
        this.message.forward(event);
        event.preventDefault();
        break;

      case 'u'.charCodeAt(0):
        // Hey, let's move back to this message next time!
        this.message._domNode.setAttribute("tabindex", "1");
        this.message._conversation._window
          .SetFocusThreadPane(event);
        event.preventDefault();
        break;

      case 'a'.charCodeAt(0):
        msgHdrsArchive(this.message._conversation.msgHdrs);
        event.preventDefault();
        break;

      case '#'.charCodeAt(0):
        msgHdrsDelete(this.message._conversation.msgHdrs);
        event.preventDefault();
        break;
    }
  },
}

// Call that one after setting this._msgHdr;
function Message(aConversation, aSignalFn) {
  this._signal = aSignalFn;
  this._didStream = false;
  this._domNode = null;
  this._snippet = "";
  this._conversation = aConversation;

  let date = new Date(this._msgHdr.date/1000);
  this._date = Prefs["no_friendly_date"] ? dateAsInMessageList(date) : makeFriendlyDateAgo(date);
  // This one is for display purposes
  this._from = this.parse(this._msgHdr.mime2DecodedAuthor)[0];
  // Might be filled to something more meaningful later, in case we replace the
  //  sender with something more relevant, like X-Bugzilla-Who.
  this._realFrom = "";
  this._to = this.parse(this._msgHdr.mime2DecodedRecipients);
  this._cc = this.parse(this._msgHdr.ccList);
  this._bcc = this.parse(this._msgHdr.bccList);
  this.subject = this._msgHdr.mime2DecodedSubject;

  this._uri = this._msgHdr.folder.getUriForMsg(this._msgHdr);
  this._contacts = [];
}

Message.prototype = {
  cssClass: "message",

  // Joins together names and format them as "John, Jane and Julie"
  join: function (aElements) {
    let l = aElements.length;
    if (l == 0)
      return "";
    else if (l == 1)
      return aElements[0];
    else {
      let hd = aElements.slice(0, l - 1);
      let tl = aElements[l-1];
      return hd.join(", ") + " and " + tl;
    }
  },

  // Wraps the low-level header parser stuff.
  //  @param aMimeLine a line that looks like "John <john@cheese.com>, Jane <jane@wine.com>"
  //  @return a list of { email, name } objects
  parse: function (aMimeLine) {
    let emails = {};
    let fullNames = {};
    let names = {};
    let numAddresses = gHeaderParser.parseHeadersWithArray(aMimeLine, emails, names, fullNames);
    return [{ email: emails.value[i], name: names.value[i] }
      for each (i in range(0, numAddresses))];
  },

  // Picks whatever's available from an { email, name } and return it as
  // suitable for insertion into HTML
  format: function (p) {
    return (p ? escapeHtml(p.name || p.email) : "");
  },

  // Output this message as a whole bunch of HTML
  toHtmlString: function () {
    let self = this;

    let contactFrom = this._conversation._contactManager
      .getContactFromNameAndEmail(this._from.name, this._from.email);
    this._contacts.push(contactFrom);
    // with color
    let fromStr = contactFrom.toHtmlString(true, Contacts.kFrom);

    let to = this._to.concat(this._cc).concat(this._bcc);
    let contactsTo = to.map(function (x) {
      return self._conversation._contactManager
        .getContactFromNameAndEmail(x.name, x.email);
    });
    this._contacts = this._contacts.concat(contactsTo);
    // false means "no colors"
    let toStr = this.join(contactsTo.map(function (x) x.toHtmlString(false, Contacts.kTo)));

    let snippet = escapeHtml(this._snippet);
    let date = escapeHtml(this._date);

    let r = [
      "<li class=\"message collapsed\">\n",
      //"  <!-- Message-ID: ", this._msgHdr.messageId, " -->\n",
      "  <div class=\"messageHeader hbox\">\n",
      "    <div class=\"star\">\n",
      "    </div>\n",
      "    <div class=\"author\">\n",
      "      ", fromStr, "\n",
      "    </div>\n",
      "    <div class=\"involved boxFlex\">\n",
      "      <span class=\"to\">to ", toStr, "</span>\n",
      "      <span class=\"snippet\"><ul class=\"tags\"></ul>", snippet, "</span>\n",
      "    </div>\n",
      "    <div class=\"options\">\n",
      "      <span class=\"date\">", date, "</span>\n",
      "      <span class=\"details\">| <a href=\"javascript:\">details</a> |</span> \n",
      "      <span class=\"dropDown\">\n",
      "        <a href=\"javascript:\">more <span class=\"downwardArrow\">&#x25bc;</span></a>\n",
      "        <div class=\"tooltip\">\n",
      "          <ul>\n",
      "            <li class=\"action-archive\">archive this message\n",
      "              <div class=\"arrow\"></div>\n",
      "              <div class=\"arrow inside\"></div>\n",
      "            </li>\n",
      "            <li class=\"action-delete\">delete this message</li>\n",
      "            <li class=\"action-monospace\">this sender sends monospace</li>\n",
      "            <li class=\"action-classic\">view using the classic reader</li>\n",
      "            <li class=\"action-source\">view message source</li>\n",
      "          </ul>\n",
      "        </div>\n",
      "      </span>\n",
      "    </div>\n",
      "  </div>\n",
      "  <div class=\"messageBody\">\n",
      "    <span class=\"iconBox\"></span>\n",
      "    <a href=\"javascript:\" class=\"show-remote-content\">show remote content</a>\n",
      "    <ul class=\"tags\"></ul>\n",
      "  </div>\n",
      "  <div class=\"messageFooter\">\n",
      "    <button class=\"reply\">reply</button>\n",
      "    <button class=\"replyAll\">reply all</button>\n",
      "    <button class=\"forward\">forward</button>\n",
      "    <button style=\"float:right;margin: 0 0 0 0;\">more...</button>\n",
      "  </div>\n",
      "</li>\n"
    ].join("");
    return r;
  },

  // Once the conversation has added us into the DOM, we're notified about it
  //  (aDomNode is us), and we can start registering event handlers and stuff
  onAddedToDom: function (aDomNode) {
    if (!aDomNode) {
      Log.error("onAddedToDom() && !aDomNode", this.from, this.to, this.subject);
    }

    // This allows us to pre-set the star and the tags in the right original
    //  state
    this._domNode = aDomNode;
    this.onAttributesChanged(this);

    let self = this;
    this._domNode.getElementsByClassName("messageHeader")[0]
      .addEventListener("click", function () self.toggle(), false);

    let keyListener = new KeyListener(this);
    this._domNode.addEventListener("keypress", function (event) {
      keyListener.onKeyPress(event);
    }, false);
  },

  notifiedRemoteContentAlready: false,

  // The global monkey-patch finds us inside the current conversation and
  //  notifies us.
  onMsgHasRemoteContent: function _Message_onMsgHasRemoteContent () {
    if (this.notifiedRemoteContentAlready)
      return;
    this.notifiedRemoteContentAlready = true;
    Log.debug("This message's remote content was blocked");

    let link = this._domNode.getElementsByClassName("show-remote-content")[0];
    link.style.display = "inline";
  },

  compose: function _Message_compose (aCompType, aEvent) {
    if (aEvent.shiftKey) {
      this._conversation._window.ComposeMessage(aCompType, Ci.nsIMsgCompFormat.OppositeOfDefault, this._msgHdr.folder, [this._uri]);
    } else {
      this._conversation._window.ComposeMessage(aCompType, Ci.nsIMsgCompFormat.Default, this._msgHdr.folder, [this._uri]);
    }
  },

  forward: function _Message_forward (event) {
    let forwardType = 0;
    try {
      forwardType = Prefs.getInt("mail.forward_message_mode");
    } catch (e) {
      Log.error("Unable to fetch preferred forward mode\n");
    }
    if (forwardType == 0)
      this.compose(Ci.nsIMsgCompType.ForwardAsAttachment, event);
    else
      this.compose(Ci.nsIMsgCompType.ForwardInline, event);
  },

  // Actually, we only do these expensive DOM calls when we need to, i.e. when
  //  we're expanded for the first time (expand calls us).
  registerActions: function _Message_registerActions() {
    let self = this;

    // Forward the calls to each contact.
    let people = this._domNode.getElementsByClassName("tooltip");
    [x.onAddedToDom(people[i]) for each ([i, x] in Iterator(this._contacts))];

    // Let the UI do its stuff with the tooltips
    this._conversation._htmlPane.contentWindow.enableTooltips(this);

    // Register all the needed event handlers. Nice wrappers below.
    let register = function _register (selector, f, action) {
      if (!action)
        action = "click";
      let nodes = selector ? self._domNode.querySelectorAll(selector) : [self._domNode];
      for each (let [, node] in Iterator(nodes))
        node.addEventListener(action, f, false);
    };
    register(".reply", function (event) self.compose(Ci.nsIMsgCompType.ReplyToSender, event));
    register(".replyAll", function (event) self.compose(Ci.nsIMsgCompType.ReplyAll, event));
    register(".forward", function (event) self.forward(event));
    // These event listeners are all in the header, which happens to have an
    //  event listener set on the click event for toggling the message. So we
    //  make sure that event listener is bubbling, and we register these with
    //  the bubbling model as well.
    register(".action-archive", function (event) {
      msgHdrsArchive([self._msgHdr], self._conversation._window)
      event.stopPropagation();
    });
    register(".action-delete", function (event) {
      msgHdrsDelete([self._msgHdr])
      event.stopPropagation();
    });
    register(".action-monospace", function (event) {
      let senders = Prefs["monospaced_senders"] || [];
      let email = self._realFrom.email || self._from.email;
      if (!senders.filter(function (x) x == email).length) {
        Prefs.setChar("conversations.monospaced_senders", senders.concat([email]).join(","));
      }
      self._reloadMessage();
      event.stopPropagation();
    });
    register(".action-classic", function (event) {
      let tabmail = self._conversation._window.document.getElementById("tabmail");
      tabmail.openTab("message", { msgHdr: self._msgHdr, background: false });
      event.stopPropagation();
    });
    register(".action-source", function (event) {
      self._conversation._window.ViewPageSource([self._uri])
      event.stopPropagation();
    });
    register(".star", function (event) {
      self.starred = !self.starred;
      // Don't trust gloda. Big hack, self also has the "starred" property, so
      //  we don't have to create a new object.
      self.onAttributesChanged(self);
      event.stopPropagation();
    });
    register(".tooltip", function (event) {
      // Clicking inside a tooltip must not collapse the message.
      event.stopPropagation();
    });

    // ("" || "blah") == "blah" (empty string evaluates to false)
    let realFrom = String.trim(this._realFrom.email || this._from.email);
    // Actually we might not need that list item, so possibly remove it!
    if (Prefs["monospaced_senders"].filter(function (x) x == realFrom).length) {
      let node = this._domNode.getElementsByClassName("action-monospace")[0];
      node.parentNode.removeChild(node);
    }

    register(".show-remote-content", function (event) {
      event.target.style.display = "none";
      self._msgHdr.setUint32Property("remoteContentPolicy", kAllowRemoteContent);
      self._reloadMessage();
    });
  },

  _reloadMessage: function _Message_reloadMessage () {
    this.iframe.parentNode.removeChild(this.iframe);
    this.streamMessage();
  },

  get iframe () {
    return this._domNode.getElementsByTagName("iframe")[0];
  },

  cosmeticFixups: function _Message_cosmeticFixups() {
    // XXX this is too brutal, do something more elaborate, like add a specific
    //  class
    let window = this._conversation._htmlPane.contentWindow;
    let toNode = this._domNode.getElementsByClassName("to")[0];
    let style = window.getComputedStyle(toNode, null);
    let overflowed = false;
    while (parseInt(style.height) > 18 && toNode.childNodes.length > 1) {
      toNode.removeChild(toNode.childNodes[toNode.childNodes.length - 1]);
      overflowed = true;
      style = window.getComputedStyle(toNode, null);
    }
    if (overflowed) {
      // Don't use unicode ellipsis here (…) -- will display garbage, don't know
      //  why
      let dots = toNode.ownerDocument.createTextNode("...");
      toNode.appendChild(dots);
      while (parseInt(style.height) > 18 && toNode.childNodes.length > 2) {
        toNode.removeChild(toNode.childNodes[toNode.childNodes.length - 2]);
        style = window.getComputedStyle(toNode, null);
      }
    }
  },

  // {
  //  starred: bool,
  //  tags: nsIMsgTag list,
  // } --> both Message and GlodaMessage implement these attributes
  onAttributesChanged: function _Message_onAttributesChanged({ starred, tags }) {
    // Update "starred" attribute
    if (starred)
      this._domNode.getElementsByClassName("star")[0].classList.add("starred");
    else
      this._domNode.getElementsByClassName("star")[0].classList.remove("starred");

    // Update tags
    let tagList = this._domNode.getElementsByClassName("tags")[0];
    while (tagList.firstChild)
      tagList.removeChild(tagList.firstChild);
    for each (let [, tag] in Iterator(tags)) {
      let colorClass = "blc-" + gMsgTagService.getColorForKey(tag.key).substr(1);
      let tagName = tag.tag;
      let tagNode = this._domNode.ownerDocument.createElement("li");
      tagNode.classList.add("tag");
      tagNode.classList.add(colorClass);
      tagNode.textContent = tagName;
      tagList.appendChild(tagNode);
    }
    this._domNode.getElementsByClassName("tags")[1].innerHTML = tagList.innerHTML;
  },

  // Convenience properties
  get read () {
    return this._msgHdr.isRead;
  },

  get starred () {
    return this._msgHdr.isFlagged;
  },

  set starred (v) {
    this._msgHdr.markFlagged(v);
  },

  get tags () {
    return msgHdrGetTags(this._msgHdr);
  },

  get collapsed () {
    return this._domNode.classList.contains("collapsed");
  },

  get expanded () {
    return !this.collapsed;
  },

  toggle: function () {
    if (this.collapsed)
      this.expand();
    else if (this.expanded)
      this.collapse();
    else
      Log.error("WTF???");
  },

  expand: function () {
    this._domNode.classList.remove("collapsed");
    if (!this._didStream) {
      try {
        this.registerActions();
        this.cosmeticFixups();
        this.streamMessage(); // will call _signal
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    } else {
      this._signal();
    }
  },

  collapse: function () {
    this._domNode.classList.add("collapsed");
  },

  // This function takes care of streaming the message into the <iframe>, adding
  // it into the DOM tree, watching for completion, reloading if necessary
  // (BidiUI), applying the various heuristics for detecting quoted parts,
  // changing the monospace font for the default one, possibly decrypting the
  // message using Enigmail, making coffee...
  streamMessage: function () {
    Log.assert(this.expanded, "Cannot stream a message if not expanded first!");

    let originalScroll = this._domNode.ownerDocument.documentElement.scrollTop;
    let msgWindow = getMail3Pane().msgWindow;

    let iframe = this._domNode.ownerDocument
      .createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "iframe");
    iframe.setAttribute("transparent", "transparent"); // Big hack to workaround bug 540911
    iframe.setAttribute("style", "height: 20px");
    iframe.setAttribute("type", "content");

    // The xul:iframe automatically loads about:blank when it is added
    // into the tree. We need to wait for the document to be loaded before
    // doing things.
    //
    // Why do we do that? Basically because we want the <xul:iframe> to
    // have a docShell and a webNavigation. If we don't do that, and we
    // set directly src="about:blank" above, sometimes we are too fast and
    // the docShell isn't ready by the time we get there.
    let self = this;
    iframe.addEventListener("load", function f_temp2(event, aCharset) {
      try {
        iframe.removeEventListener("load", f_temp2, true);

        // The second load event is triggered by loadURI with the URL
        // being the necko URL to the given message.
        iframe.addEventListener("load", function f_temp1(event) {
          try {
            iframe.removeEventListener("load", f_temp1, true);
            // XXX cut this off and turn into a this._onMessageStreamed
            let iframeDoc = iframe.contentDocument;

            // Do some reformatting + deal with people who have bad taste
            iframeDoc.body.setAttribute("style", "padding: 0; margin: 0; "+
              "color: rgb(10, 10, 10); background-color: transparent; "+
              "-moz-user-focus: none !important; ");

            // Remove the attachments if the user has not set View >
            // Display Attachments Inline. Do that right now, otherwise the
            // quoted text detection will mess up the markup.
            let fieldsets = iframeDoc.getElementsByClassName("mimeAttachmentHeader");
            for (let i = fieldsets.length - 1; i >= 0; i--) {
              Log.warn("Found an attachment, removing... please uncheck View > Display attachments inline.");
              let node = fieldsets[i];
              while (node.nextSibling)
                node.parentNode.removeChild(node.nextSibling);
              node.parentNode.removeChild(node);
            }

            // Launch various crappy pieces of code^W^W^W^W heuristics to
            //  convert most common quoting styles to real blockquotes. Spoiler:
            //  most of them suck.
            convertOutlookQuotingToBlockquote(iframe.contentWindow, iframeDoc);
            convertHotmailQuotingToBlockquote1(iframeDoc);
            convertHotmailQuotingToBlockquote2(iframe.contentWindow, iframeDoc, Prefs["hide_quote_length"]);
            convertForwardedToBlockquote(iframeDoc);
            fusionBlockquotes(iframeDoc);
            // this function adds a show/hide quoted text link to every topmost
            // blockquote. Nested blockquotes are not taken into account.
            let walk = function walk_ (elt) {
              for (let i = elt.childNodes.length - 1; i >= 0; --i) {
                let c = elt.childNodes[i];
                // GMail uses class="gmail_quote", other MUAs use type="cite"...
                // so just search for a regular blockquote
                if (c.tagName && c.tagName.toLowerCase() == "blockquote") {
                  if (c.getUserData("hideme") !== false) { // null is ok, true is ok too
                    // Compute the approximate number of lines while the element is still visible
                    let style;
                    try {
                      style = iframe.contentWindow.getComputedStyle(c, null);
                    } catch (e) {
                      // message arrived and window is not displayed, arg,
                      // cannot get the computed style, BAD
                    }
                    if (style) {
                      let numLines = parseInt(style.height) / parseInt(style.lineHeight);
                      if (numLines > Prefs["hide_quote_length"]) {
                        let showText = strings.get("showquotedtext");
                        let hideText = strings.get("hidequotedtext");
                        let div = iframeDoc.createElement("div");
                        div.setAttribute("class", "link showhidequote");
                        div.addEventListener("click", function div_listener (event) {
                          let h = self._conversation._htmlPane.contentWindow.toggleQuote(event, showText, hideText);
                          iframe.style.height = (parseFloat(iframe.style.height) + h)+"px";
                        }, true);
                        div.setAttribute("style", "color: orange; cursor: pointer; font-size: 11px;");
                        div.appendChild(self._domNode.ownerDocument
                          .createTextNode("- "+showText+" -"));
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

            // Ugly hack (once again) to get the style inside the
            // <iframe>. I don't think we can use a chrome:// url for
            // the stylesheet because the iframe has a type="content"
            let style = iframeDoc.createElement("style");
            let defaultFont = Prefs.getChar("font.default");
            style.appendChild(iframeDoc.createTextNode(
              ".pre-as-regular {\n"+
              "  font-family: "+defaultFont+" !important;\n"+
              "  font-size: 12px !important;\n"+
              "  line-height: 18px !important;\n"+
              "}\n"
            ));
            iframeDoc.body.previousElementSibling.appendChild(style);

            // Our super-advanced heuristic ;-)
            let isPlainText =
              iframeDoc.body.firstElementChild &&
              (iframeDoc.body.firstElementChild.classList.contains("moz-text-flowed") ||
               iframeDoc.body.firstElementChild.classList.contains("moz-text-plain"));

            // The manipulations below are only valid for plain/text messages
            if (isPlainText) {
              // Unless the user specifically asked for this message to be
              // dislayed with a monospaced font...
              let [{name, email}] = self.parse(self._msgHdr.mime2DecodedAuthor);
              if (Prefs["monospaced_senders"].indexOf(email) < 0) {
                let elts = iframeDoc.querySelectorAll("pre, body > *:first-child")
                for each (let [, elt] in Iterator(elts))
                  elt.classList.toggle("pre-as-regular");
              }
            }

            // Notify hooks that we just finished displaying a message. Must be
            //  performed now, not later.
            [h.onMessageStreamed(self._msgHdr, iframe) for each ([, h] in Iterator(getHooks()))];

            // For bidiUI. Do that now because the DOM manipulations are
            //  over. We can't do this before because BidiUI screws up the
            //  DOM. Don't know why :(.
            // We can't do this as a plugin (I wish I could!) because this is
            //  too entangled with the display logic.
            if ("BiDiMailUI" in self._conversation._window) {
              let ActionPhases = self._conversation._window.BiDiMailUI.Display.ActionPhases;
              try {
                let domDocument = iframe.docShell.contentViewer.DOMDocument;
                let body = domDocument.body;

                let BDMCharsetPhaseParams = {
                  body: body,
                  charsetOverrideInEffect: msgWindow.charsetOverride,
                  currentCharset: msgWindow.mailCharacterSet,
                  messageHeader: self._msgHdr,
                  unusableCharsetHandler: self._conversation._window
                    .BiDiMailUI.MessageOverlay.promptForDefaultCharsetChange,
                  needCharsetForcing: false,
                  charsetToForce: null
                };
                ActionPhases.charsetMisdetectionCorrection(BDMCharsetPhaseParams);
                if (BDMCharsetPhaseParams.needCharsetForcing
                    && BDMCharsetPhaseParams.charsetToForce != aCharset) {
                  // XXX this doesn't take into account the case where we
                  // have a cycle with length > 0 in the reloadings.
                  // Currently, I only see UTF8 -> UTF8 cycles.
                  Log.debug("Reloading with "+BDMCharsetPhaseParams.charsetToForce);
                  f_temp2(null, BDMCharsetPhaseParams.charsetToForce);
                  return;
                }
                ActionPhases.htmlNumericEntitiesDecoding(body);
                ActionPhases.quoteBarsCSSFix(domDocument);
                ActionPhases.directionAutodetection(domDocument);
              } catch (e) {
                Log.error(e);
                dumpCallStack(e);
              }
            }

            // Attach the required event handlers so that links open in the
            // external browser.
            for each (let [, a] in Iterator(iframeDoc.getElementsByTagName("a"))) {
              a.addEventListener("click",
                function link_listener (event)
                  self._conversation._window.specialTabs.siteClickHandler(event, /^mailto:/), true);
            }

            // Everything's done, so now we're able to settle for a height.
            iframe.style.height = iframeDoc.body.scrollHeight+"px";

            // Sometimes setting the iframe's content and height changes
            // the scroll value, don't know why.
            if (originalScroll)
              self._domNode.ownerDocument.documentElement.scrollTop = originalScroll;

            self._didStream = true;
            self._signal();
          } catch (e) {
            Log.warn(e, "(are you running comm-central?)");
            Log.warn("Running signal once more to make sure we move on with our life... (warning, this WILL cause bugs)");
            self._didStream = true;
            self._signal();
          }
        }, true); /* end iframe.addEventListener */

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
        let url = msgHdrToNeckoURL(self._msgHdr);

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
        // XXX in order to properly handle all kind of notifications, we should
        //  be providing our own nsIMsgWindow here, in particular, one that also
        //  has a GetMsgContentSink (or whatever) method, so that the C++
        //  content policy code can call GetMsgContentSink on it and tell us if
        //  remote content was blocked.
        //
        // http://mxr.mozilla.org/comm-central/source/mailnews/base/src/nsMsgContentPolicy.cpp#579
        // http://mxr.mozilla.org/comm-central/source/mail/base/content/msgHdrViewOverlay.js#620
        // mail/base/content/mailWindow.js (View Hg log or Hg annotations)
        //   line 146 -- msgWindow.msgHeaderSink = messageHeaderSink; 
        //
        // But maybe it isn't such a good idea after all, since we will lose all
        //  kinds of standard error handling code (bad certs, and stuff). A
        //  better solution might be to monkey-patch msgHeaderSink right at the
        //  beginning of the conversation and to replace it once the
        //  conversation's built... OR we could forward calls to the original
        //  nsIMsgWindow except for the one that we're interested in...

        /**
        * When you want a message displayed....
        *
        * @param in aMessageURI Is a uri representing the message to display.
        * @param in aDisplayConsumer Is (for now) an nsIDocShell which we'll use to load 
        *                         the message into.
        *                         XXXbz Should it be an nsIWebNavigation or something?
        * @param in aMsgWindow
        * @param in aUrlListener
        * @param in aCharsetOverride (optional) character set override to force the message to use.
        * @param out aURL
        */
        messageService.DisplayMessage(self._uri, iframe.docShell, msgWindow,
                                      urlListener, aCharset, {});
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, true); /* end document.addEventListener */

    // Ok, brace ourselves for notifications happening during the message load
    //  process.
    addMsgListener(this);

    // This triggers the whole process. We assume (see beginning) that the
    // message is expanded which means the <iframe> will be visible right away
    // which means we can use offsetHeight, getComputedStyle and stuff on it.
    this._domNode.getElementsByClassName("messageBody")[0]
      .appendChild(iframe);
  }
}

function MessageFromGloda(aConversation, aSignalFn, aGlodaMsg) {
  this._msgHdr = aGlodaMsg.folderMessage;
  Message.apply(this, arguments);

  if (aGlodaMsg.alternativeSender) {
    this._realFrom = this._from;
    this._from = this.parse(aGlodaMsg.alternativeSender)[0];
  }
  this._glodaMsg = aGlodaMsg;
  this._snippet = this._glodaMsg._indexedBodyText
    ? this._glodaMsg._indexedBodyText.substring(0, snippetLength-1)
    : "..."; // it's probably an Enigmail message
  this._signal();
}

MessageFromGloda.prototype = {
  __proto__: Message.prototype,
}

MixIn(MessageFromGloda, Message);

function MessageFromDbHdr(aConversation, aSignalFn, aMsgHdr) {
  this._msgHdr = aMsgHdr;
  Message.apply(this, arguments);

  // Gloda is not with us, so stream the message... the MimeMsg API says that
  //  the streaming will fail and the underlying exception will be re-thrown in
  //  case the message is not on disk. In that case, the fallback is to just get
  //  the body text and wait for it to be ready. This can be SLOW (like, real
  //  slow). But at least it works. (Setting the fourth parameter to true just
  //  leads to an empty snippet).
  let self = this;
  Log.warn("Streaming the message because Gloda has not indexed it, this is BAD");
  try {
    MsgHdrToMimeMessage(aMsgHdr, null, function(aMsgHdr, aMimeMsg) {
      if (aMimeMsg == null) {
        self._fallbackSnippet();
        return;
      }
      let [text, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, snippetLength);
      self._snippet = text;
      if ("x-bugzilla-who" in aMimeMsg.headers) {
        self._realFrom = self._from;
        self._from = self.parse(aMimeMsg.headers["x-bugzilla-who"])[0];
      }
      self._signal();
    });
  } catch (e) {
    // Remember: these exceptions don't make it out of the callback (XPConnect
    // death trap, can't fight it until we reach level 3 and gain 1200 exp
    // points, so keep training)
    Log.warn("Gloda failed to stream the message properly, this is VERY BAD");
    Log.warn(e);
    this._fallbackSnippet();
  }
}

MessageFromDbHdr.prototype = {
  __proto__: Message.prototype,

  _fallbackSnippet: function _MessageFromDbHdr_fallbackSnippet () {
    // XXX consider calling signal right away not to block the conversation
    // XXX doesn't seem to work somehow???
    let body = msgHdrToMessageBody(this._msgHdr, true, snippetLength);
    this._snippet = body.substring(0, snippetLength-1);
    this._signal();
  },
}

MixIn(MessageFromDbHdr, Message);
