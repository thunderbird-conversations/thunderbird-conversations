/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, Quoting, messageActions */
/* exported MessageIFrame */

let index = 0;

// From https://searchfox.org/mozilla-central/rev/ec806131cb7bcd1c26c254d25cd5ab8a61b2aeb6/parser/nsCharsetSource.h
const kCharsetFromChannel = 11;

/**
 * This class exists because we need to manually manage the iframe - we don't
 * want it reloading every time a prop changes.
 *
 * We only load the iframe when we need to - when it is expanded. If it is
 * collapsed, we avoid it. This helps performance.
 *
 * The height mechanism is awkward - we generally set the height short when
 * we start to render it, then expand it to the correct height once loaded,
 * which attempts to avoid a sub-scroll.
 */
class MessageIFrame extends React.Component {
  constructor(props) {
    super(props);
    this.index = index++;
    this.currentUrl = null;
    this.loading = false;
    this.onClickIframe = this.onClickIframe.bind(this);
  }

  componentDidUpdate(prevProps) {
    let startLoad = false;
    // dueToExpansion is used so that we can indicate if this load is happening
    // as a result of an expansion or not. If it is a user expansion, we don't
    // want to scroll the message to view, since the user may be viewing somewhere
    // else.
    this.dueToExpansion = undefined;
    if (prevProps.neckoUrl != this.props.neckoUrl && this.props.expanded) {
      // This is a hack which ensures that the iframe is a minimal height, so
      // that when the message loads, the scroll height is set correctly, rather
      // than to the potential height of the previously loaded message.
      // TODO: Could we use a client height somewhere along the line?
      this.iframe.classList.remove("hidden");
      this.iframe.style.height = "20px";
      startLoad = true;
      this.dueToExpansion = false;
    }
    if (this.props.expanded) {
      this.iframe.classList.remove("hidden");
      if (
        this.currentUrl != this.props.msgUri ||
        (prevProps.hasRemoteContent && !this.props.hasRemoteContent) ||
        (!prevProps.smimeReload && this.props.smimeReload)
      ) {
        startLoad = true;
        if (this.dueToExpansion === undefined) {
          this.dueToExpansion = true;
        }
        this.iframe.style.height = "20px";
      }
    } else {
      // Never start a load if we're going to be hidden.
      startLoad = false;
      // If we're changing URL, then also force the iframe to be about:blank.
      // This ensures that if the message is subsequently expanded, the proper
      // notifications are sent.
      if (prevProps.neckoUrl != this.props.neckoUrl) {
        this.iframe.src = "about:blank";
        this.currentUrl = "about:blank";
      }
      this.iframe.classList.add("hidden");
    }
    if (startLoad) {
      this.loading = true;
      this.currentUrl = this.props.msgUri;
      this.props.dispatch({
        type: "MSG_STREAM_MSG",
        docshell: this.iframe.contentWindow.docShell,
        dueToExpansion: this.dueToExpansion,
        msgUri: this.props.msgUri,
      });
    }
  }

  componentDidMount() {
    // TODO: Currently this must be an iframe created in the xul namespace,
    // otherwise remote content blocking doesn't work. Figure out why the normal
    // iframe has a originator location of `chrome://messenger/content/messenger.xul`
    // rather than imap://.... (or whatever).
    this.iframe = this.div.ownerDocument.createElementNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      "iframe"
    );
    this.iframe.setAttribute("style", "height: 20px; overflow-y: hidden");
    this.iframe.setAttribute("type", "content");
    this.iframe.addEventListener("click", this.onClickIframe);
    this.div.appendChild(this.iframe);

    const docShell = this.iframe.contentWindow.docShell;
    docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
    docShell.charset = "UTF-8";
    const cv = docShell.contentViewer;
    cv.hintCharacterSet = "UTF-8";
    // Support Thunderbird 68.
    if ("forceCharacterSet" in cv) {
      cv.forceCharacterSet = "UTF-8";
    }
    cv.hintCharacterSetSource = kCharsetFromChannel;
    this.registerListeners();
    if (this.props.expanded) {
      this.currentUrl = this.props.msgUri;
      this.loading = true;
      this.dueToExpansion = false;
      this.props.dispatch({
        type: "MSG_STREAM_MSG",
        docshell: docShell,
        msgUri: this.props.msgUri,
      });
    } else {
      this.iframe.classList.add("hidden");
    }
  }

  componentWillUnmount() {
    if (this.loading) {
      this.props.dispatch({
        type: "MSG_STREAM_LOAD_FINISHED",
        dueToExpansion: this.dueToExpansion,
      });
      this.loading = false;
    }
    if (!this._loadListener) {
      return;
    }
    this.iframe.removeEventListener("load", this._loadListener, {
      capture: true,
    });
    delete this._loadListener;
    this.iframe.removeEventListener("DOMContentLoaded", this._domloadListener, {
      capture: true,
    });
    delete this._domloadListener;
  }

  registerListeners() {
    if (!this._loadListener) {
      this._loadListener = this._onLoad.bind(this);
      this.iframe.addEventListener("load", this._loadListener, {
        capture: true,
      });
      this._domloadListener = this._onDOMLoaded.bind(this);
      this.iframe.addEventListener("DOMContentLoaded", this._domloadListener, {
        capture: true,
      });
    }
  }

  adjustHeight() {
    const iframeDoc = this.iframe.contentDocument;

    // The +1 here is due to having occasionally seen issues on Mac where
    // the frame just doesn't quite scroll properly. In this case,
    // getComputedStyle(body).height is .2px greater than the scrollHeight.
    // Hence we try to work around that here.
    // In #1517 made it +3 as occasional issues were still being seen with
    // some messages.
    const scrollHeight = iframeDoc.body.scrollHeight + 3;
    this.iframe.style.height = scrollHeight + "px";

    // So now we might overflow horizontally, which causes a horizontal
    // scrollbar to appear, which narrows the vertical height available,
    // which causes a vertical scrollbar to appear.
    let iframeStyle = window.getComputedStyle(this.iframe);
    let iframeExternalWidth = parseInt(iframeStyle.width);
    // 20px is a completely arbitrary default value which I hope is
    // greater
    if (iframeDoc.body.scrollWidth > iframeExternalWidth) {
      this.iframe.style.height = iframeDoc.body.scrollHeight + 20 + "px";
    }
  }

  _onLoad(event) {
    if (event.target.documentURI == "about:blank") {
      return;
    }
    // TODO: Handle BIDI

    this.adjustHeight();
    this.loading = false;
    this.props.dispatch({
      type: "MSG_STREAM_LOAD_FINISHED",
      dueToExpansion: this.dueToExpansion,
      msgUri: this.props.msgUri,
      iframe: this.iframe,
    });
  }

  tweakFonts(iframeDoc) {
    if (!this.props.prefs.tweakBodies) {
      return [];
    }

    let textSize = Math.round(
      this.props.defaultFontSize * this.props.tenPxFactor * 1.2
    );

    // Assuming 16px is the default (like on, say, Linux), this gives
    //  18px and 12px, which is what Andy had in mind.
    // We're applying the style at the beginning of the <head> tag and
    //  on the body element so that it can be easily overridden by the
    //  html.
    // This is for HTML messages only.
    let styleRules = [];
    if (
      iframeDoc.querySelectorAll(":not(.mimemail-body) > .moz-text-html").length
    ) {
      styleRules = [
        "body, table {",
        // "  line-height: 112.5%;",
        "  font-size: " + textSize + "px;",
        "}",
      ];
    }

    // Do some reformatting + deal with people who have bad taste. All these
    // rules are important: some people just send messages with horrible colors,
    // which ruins the conversation view. Gecko tends to automatically add
    // padding/margin to html mails. We still want to honor these prefs but
    // usually they just black/white so this is pretty much what we want.
    let fg = this.props.browserForegroundColor;
    let bg = this.props.browserBackgroundColor;
    styleRules = styleRules.concat([
      "body {",
      "  margin: 0; padding: 0;",
      "  color: " + fg + "; background-color: " + bg + ";",
      "}",
    ]);

    return styleRules;
  }

  convertCommonQuotingToBlockquote(iframe) {
    // Launch various crappy pieces of code^W^W^W^W heuristics to
    //  convert most common quoting styles to real blockquotes. Spoiler:
    //  most of them suck.
    let iframeDoc = iframe.contentDocument;
    try {
      Quoting.convertOutlookQuotingToBlockquote(
        iframe.contentWindow,
        iframeDoc
      );
      Quoting.convertHotmailQuotingToBlockquote1(iframeDoc);
      Quoting.convertForwardedToBlockquote(iframeDoc);
      Quoting.convertMiscQuotingToBlockquote(iframeDoc);
      Quoting.fusionBlockquotes(iframeDoc);
    } catch (e) {
      console.error(e);
    }
  }

  toggleBlock(event, showtext, hidetext) {
    let link = event.target;
    let div = link.nextSibling;
    let cs = window.getComputedStyle(div);
    if (div.style.display == "none") {
      link.textContent = "- " + hidetext + " -";
      div.style.display = "";
      let h =
        div.getBoundingClientRect().height +
        parseFloat(cs.marginTop) +
        parseFloat(cs.marginBottom);
      return h;
    }
    let h = div.getBoundingClientRect().height;
    h += parseFloat(cs.marginTop);
    h += parseFloat(cs.marginBottom);
    link.textContent = "- " + showtext + " -";
    div.style.display = "none";
    return -h;
  }

  detectBlocks(iframe, testNode, hideText, showText, linkClass, linkColor) {
    let iframeDoc = iframe.contentDocument;

    let smallSize = this.props.prefs.tweakChrome
      ? this.props.defaultFontSize * this.props.tenPxFactor * 1.1
      : Math.round((100 * this.props.defaultFontSize * 11) / 12) / 100;

    // this function adds a show/hide block text link to every topmost
    // block. Nested blocks are not taken into account.
    function _walk(elt) {
      for (let i = elt.childNodes.length - 1; i >= 0; --i) {
        let c = elt.childNodes[i];

        // Skip iframes and tables, we shouldn't need to go into those at all.
        let tagName = c.tagName && c.tagName.toLowerCase();
        if (tagName == "iframe" || tagName == "table") {
          continue;
        }

        if (testNode(c)) {
          let div = iframeDoc.createElement("div");
          div.setAttribute("class", "link " + linkClass);
          div.addEventListener(
            "click",
            (event) => {
              let h = this.toggleBlock(event, showText, hideText);
              iframe.style.height = parseFloat(iframe.style.height) + h + "px";
            },
            true
          );
          div.setAttribute(
            "style",
            "color: " +
              linkColor +
              "; cursor: pointer; font-size: " +
              smallSize +
              "px;"
          );
          div.appendChild(iframeDoc.createTextNode("- " + showText + " -"));
          elt.insertBefore(div, c);
          c.style.display = "none";
        } else {
          walk(c);
        }
      }
    }

    let walk = _walk.bind(this);

    walk(iframeDoc.body);
  }

  detectQuotes(iframe) {
    this.convertCommonQuotingToBlockquote(iframe);

    function isBlockquote(node) {
      if (node.tagName && node.tagName.toLowerCase() == "blockquote") {
        // Compute the approximate number of lines while the element is still visible
        let style;
        try {
          style = iframe.contentWindow.getComputedStyle(node);
        } catch (e) {
          // message arrived and window is not displayed, arg,
          // cannot get the computed style, BAD
        }
        if (style) {
          let numLines = parseInt(style.height) / parseInt(style.lineHeight);
          if (numLines > this.props.prefs.hideQuoteLength) {
            return true;
          }
        }
      }

      return false;
    }

    // https://github.com/thunderbird-conversations/thunderbird-conversations/issues#issue/179
    // See link above for a rationale ^^
    if (this.props.initialPosition > 0) {
      this.detectBlocks(
        iframe,
        isBlockquote.bind(this),
        browser.i18n.getMessage("messageBody.hideQuotedText"),
        browser.i18n.getMessage("messageBody.showQuotedText"),
        "showhidequote",
        "orange"
      );
    }
  }

  detectSigs(iframe) {
    if (!this.props.prefs.hideSigs) {
      return;
    }

    function isSignature(node) {
      return node.classList && node.classList.contains("moz-txt-sig");
    }

    this.detectBlocks(
      iframe,
      isSignature,
      browser.i18n.getMessage("messageBody.hideSigText"),
      browser.i18n.getMessage("messageBody.showSigText"),
      "showhidesig",
      "rgb(56, 117, 215)"
    );
  }

  injectCss(iframeDoc) {
    // !important because messageContents.css is appended after us when the html
    // is rendered
    return [
      'blockquote[type="cite"] {',
      "  border-right-width: 0px;",
      "  border-left: 1px #ccc solid;",
      "  color: #666 !important;",
      "}",
      "span.moz-txt-formfeed {",
      "  height: auto;",
      "}",
    ];
  }

  _onDOMLoaded(event) {
    if (event.target.documentURI == "about:blank") {
      return;
    }
    const iframeDoc = this.iframe.contentDocument;
    let styleRules = this.tweakFonts(iframeDoc);
    if (
      !(this.props.realFrom && this.props.realFrom.includes("bugzilla-daemon"))
    ) {
      this.detectQuotes(this.iframe);
    }
    this.detectSigs(this.iframe);
    styleRules = styleRules.concat(this.injectCss(iframeDoc));

    // Ugly hack (once again) to get the style inside the
    // <iframe>. I don't think we can use a chrome:// url for
    // the stylesheet because the iframe has a type="content"
    let style = iframeDoc.createElement("style");
    style.appendChild(iframeDoc.createTextNode(styleRules.join("\n")));
    let head = iframeDoc.body.previousElementSibling;
    head.appendChild(style);

    this.adjustHeight();
  }

  onClickIframe(event) {
    this.props.dispatch(
      messageActions.clickIframe({
        event,
      })
    );
  }

  render() {
    // TODO: See comment in componentDidMount
    // <iframe className={`iframe${this.index}`} type="content" ref={f => this.iframe = f}/>
    return (
      <div className={`iframewrap${this.index}`} ref={(d) => (this.div = d)} />
    );
  }
}

MessageIFrame.propTypes = {
  browserBackgroundColor: PropTypes.string.isRequired,
  browserForegroundColor: PropTypes.string.isRequired,
  defaultFontSize: PropTypes.number.isRequired,
  dispatch: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  hasRemoteContent: PropTypes.bool.isRequired,
  initialPosition: PropTypes.number.isRequired,
  msgUri: PropTypes.string.isRequired,
  neckoUrl: PropTypes.string.isRequired,
  smimeReload: PropTypes.bool.isRequired,
  tenPxFactor: PropTypes.number.isRequired,
  prefs: PropTypes.object.isRequired,
  realFrom: PropTypes.string.isRequired,
};
