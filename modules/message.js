var EXPORTED_SYMBOLS = ['Message', 'MessageFromGloda', 'MessageFromDbHdr']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/templateUtils.js"); // for makeFriendlyDateAgo
Cu.import("resource:///modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/gloda/mimemsg.js");
const gMessenger = Cc["@mozilla.org/messenger;1"]
  .createInstance(Ci.nsIMessenger);
const gPrefBranch = Cc["@mozilla.org/preferences-service;1"]
  .getService(Ci.nsIPrefService).getBranch(null);
const gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"]
  .getService(Ci.nsIMsgHeaderParser);
const stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"]
  .getService(Ci.nsIStringBundleService);
const stringBundle = stringBundleService
  .createBundle("chrome://conversations/locale/main.properties");

const kCharsetFromMetaTag = 10;

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/prefs.js");
Cu.import("resource://conversations/log.js");
const Log = setupLogging();
const snippetLength = 300;

// Call that one after setting this._msgHdr;
function Message(aWindow, aSignalFn) {
  this._signal = aSignalFn;
  this._didStream = false;
  this._domNode = null;
  this._snippet = "";
  this._window = aWindow;

  let date = new Date(this._msgHdr.date/1000);
  this._date = Prefs["no_friendly_date"] ? dateAsInMessageList(date) : makeFriendlyDateAgo(date);
  let [from] = this.parse(this._msgHdr.mime2DecodedAuthor);
  this._from = from;
  this._to = this.parse(this._msgHdr.mime2DecodedRecipients);
  this._cc = this.parse(this._msgHdr.ccList);
  this._bcc = this.parse(this._msgHdr.bccList);
  this._subject = this._msgHdr.mime2DecodedSubject;
}

Message.prototype = {
  cssClass: "message",

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

  parse: function (aMimeLine) {
    let emails = {};
    let fullNames = {};
    let names = {};
    let numAddresses = gHeaderParser.parseHeadersWithArray(aMimeLine, emails, names, fullNames);
    return [{ email: emails.value[i], name: names.value[i] }
      for each (i in range(0, numAddresses))];
  },

  format: function (p) {
    return escapeHtml(p.name || p.email);
  },

  toHtmlString: function () {
    let from = this.format(this._from);
    let to = this.join(this._to.concat(this._cc).concat(this._bcc).map(this.format));
    let snippet = escapeHtml(this._snippet);
    let date = escapeHtml(this._date);

    let r = [
      "<li class=\"message collapsed\">\n",
      "  <div class=\"messageHeader hbox\">\n",
      "    <div class=\"involved boxFlex\">\n",
      "      <span class=\"author\"><img src=\"i/star.png\"> ", from, "</span>\n",
      "      <span class=\"to\">to ", to, "</span>\n",
      "      <span class=\"snippet\">", snippet, "</span>\n",
      "    </div>\n",
      "    <div class=\"options\">\n",
      "      <span class=\"date\">",date,"</span>\n",
      "      <span class=\"details\">| <a href=\"#\">details</a> |</span> \n",
      "      <span class=\"dropDown\"><a href=\"#\">more...</a></span>\n",
      "    </div>\n",
      "  </div>\n",
      "  <div class=\"messageBody\">\n",
      "  </div>\n",
      "  <div class=\"messageFooter\">\n",
      "    <button>reply</button>\n",
      "    <button>reply all</button>\n",
      "    <button>forward</button>\n",
      "    <button style=\"float:right;margin: 0 0 0 0;\">more...</button>\n",
      "  </div>\n",
      "</li>\n"
    ].join("");
    return r;
  },

  onAddedToDom: function (aDomNode) {
    this._domNode = aDomNode;
    let msgHeaderNode = this._domNode.getElementsByClassName("messageHeader")[0];
    let self = this;
    msgHeaderNode.addEventListener("click", function () self.toggle(), false);
  },

  get collapsed () {
    return this._domNode.classList.contains("collapsed");
  },

  get expanded () {
    return !this.collapsed;
  },

  toggle: function () {
    Log.debug("Toggling...");
    if (this.collapsed)
      this.expand();
    else if (this.expanded)
      this.collapse();
    else
      Log.error("WTF???");
  },

  expand: function () {
    this._domNode.classList.remove("collapsed");
    if (!this._didStream)
      this.streamMessage();
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
    let msgWindow = this._window.msgWindow;

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

            // Launch various heuristics to convert most common quoting styles
            // to real blockquotes. Spoiler: most of them suck.
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
                    let style = iframe.contentWindow.getComputedStyle(c, null);
                    if (style) {
                      let numLines = parseInt(style.height) / parseInt(style.lineHeight);
                      if (numLines > Prefs["hide_quote_length"]) {
                        let div = iframeDoc.createElement("div");
                        div.setAttribute("class", "link showhidequote");
                        div.addEventListener("click", function div_listener (event) {
                            let h = htmlpane.contentWindow.toggleQuote(event);
                            iframe.style.height = (parseFloat(iframe.style.height) + h)+"px";
                          }, true);
                        div.setAttribute("style", "color: orange; cursor: pointer; font-size: 11px;");
                        div.appendChild(self._domNode.ownerDocument.createTextNode("- "+
                          stringBundle.GetStringFromName("showquotedtext")+" -"));
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

            // Hello, Enigmail. Do that now, because decrypting a message
            // will change its height. If you've got nothing better to do,
            // test for the remaining 4572 possible statuses.
            /* if (iframeDoc.body.textContent.length > 0 && hasEnigmail) {
              let status = tryEnigmail(iframeDoc.body);
              if (status & Ci.nsIEnigmail.DECRYPTION_OKAY)
                self._domNode.getElementsByClassName("enigmail-enc-ok")[0].style.display = "";
              if (status & Ci.nsIEnigmail.GOOD_SIGNATURE)
                self._domNode.getElementsByClassName("enigmail-sign-ok")[0].style.display = "";
              if (status & Ci.nsIEnigmail.UNVERIFIED_SIGNATURE)
                self._domNode.getElementsByClassName("enigmail-sign-unknown")[0].style.display = "";
            } */

            // Ugly hack (once again) to get the style inside the
            // <iframe>. I don't think we can use a chrome:// url for
            // the stylesheet because the iframe has a type="content"
            let style = iframeDoc.createElement("style");
            let defaultFont = gPrefBranch.getCharPref("font.default");
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

            // For bidiUI. Do that now because the DOM manipulations are
            // over. We can't do this before because BidiUI screws up the
            // DOM. Don't know why :(.
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
                  // XXX this doesn't take into account the case where we
                  // have a cycle with length > 0 in the reloadings.
                  // Currently, I only see UTF8 -> UTF8 cycles.
                  Error.debug("Reloading with "+BDMCharsetPhaseParams.charsetToForce);
                  f_temp2(null, BDMCharsetPhaseParams.charsetToForce);
                  return;
                }
                BDMActionPhase_htmlNumericEntitiesDecoding(body);
                BDMActionPhase_quoteBarsCSSFix(domDocument);
                BDMActionPhase_directionAutodetection(body);
              } catch (e) {
                Log.error(e);
              }
            }

            // Everything's done, so now we're able to settle for a height.
            iframe.style.height = iframeDoc.body.scrollHeight+"px";

            // Attach the required event handlers so that links open in the
            // external browser
            for each (let [, a] in Iterator(iframeDoc.getElementsByTagName("a"))) {
              a.addEventListener("click",
                function link_listener (event)
                  specialTabs.siteClickHandler(event, /^mailto:/), true);
            }

            // Sometimes setting the iframe's content and height changes
            // the scroll value, don't know why.
            if (originalScroll)
              self._domNode.ownerDocument.documentElement.scrollTop = originalScroll;

            self._didStream = true;
            self._signal();
          } catch (e) {
            Log.warn(e+" (are you running comm-central?)");
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
        let uri = self._msgHdr.folder.getUriForMsg(self._msgHdr);
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
      } catch (e) {
        Log.error(e);
        dumpCallStack(e);
      }
    }, true); /* end document.addEventListener */

    // This triggers the whole process. We assume (see beginning) that the
    // message is expanded which means the <iframe> will be visible right away
    // which means we can use offsetHeight, getComputedStyle and stuff on it.
    this._domNode.getElementsByClassName("messageBody")[0]
      .appendChild(iframe);
  }
}

function MessageFromGloda(aWindow, aSignalFn, aGlodaMsg) {
  this._msgHdr = aGlodaMsg.folderMessage;
  Message.apply(this, arguments);

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

function MessageFromDbHdr(aWindow, aSignalFn, aMsgHdr) {
  this._msgHdr = aMsgHdr;
  Message.apply(this, arguments);

  // Gloda is not with us, so stream the message... streaming the message can
  // fail with messages that just arrived, or more generally, messages that
  // haven't been stored on disk yet. I don't know why. In that case, the
  // fallback is to just get the body text and wait for it to be ready. This can
  // be SLOW (like, real slow).
  let self = this;
  MsgHdrToMimeMessage(aMsgHdr, null, function(aMsgHdr, aMimeMsg) {
    Log.warn("Streaming the message because Gloda has not indexed it, this is BAD");
    try {
      if (aMimeMsg == null) {
        // XXX consider calling signal right away not to block the conversation
        Log.warn("Gloda failed to stream the message properly, this is VERY BAD");
        let body = msgHdrToMessageBody(msgHdr, true, snippetLength);
        self._snippet = body.substring(0, snippetLength-1);
        self._signal();
      } else {
        let [text, meta] = mimeMsgToContentSnippetAndMeta(aMimeMsg, aMsgHdr.folder, snippetLength);
        self._snippet = text;
        self._signal();
      }
    } catch (e) {
      // Remember: these exceptions don't make it out of the callback (XPConnect
      // death trap, can't fight it until we reach level 3 and gain 1200 exp
      // points, so keep training)
      Log.error(e);
    }
  });
}

MessageFromDbHdr.prototype = {
  __proto__: Message.prototype,
}

MixIn(MessageFromDbHdr, Message);
