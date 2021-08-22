/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { messageActions } from "../../reducer/reducer-messages.js";
import { summaryActions } from "../../reducer/reducer-summary.js";
import { Quoting } from "../../utils/quoting.js";
import { isWebextension } from "../../es-modules/thunderbird-compat.js";

let index = 0;

// From https://searchfox.org/mozilla-central/rev/ec806131cb7bcd1c26c254d25cd5ab8a61b2aeb6/parser/nsCharsetSource.h
// const kCharsetFromChannel = 11;
const kCharsetFromUserForced = 13;

const domParser = new DOMParser();
const TOGGLE_TEMPLATE = `<button
    class="link"
    style="cursor: pointer; user-select: none; background-color: inherit; border: inherit;"
    show-text=""
    hide-text=""
  >
    SHOW/HIDE
  </button>`;

/**
 * Create a DOM node that, when clicked, will hide or unhide `node`.
 * The returned DOM node is automatically attached to the DOM right before `node`.
 *
 * @param {object} node
 * @param {object} root0
 * @param {string} root0.showText
 * @param {string} root0.hideText
 * @param {string} [root0.linkClass]
 * @param {number} [root0.smallSize]
 * @param {string} [root0.linkColor]
 * @param {boolean} [root0.startHidden]
 * @param {Function} [root0.onToggle]
 * @returns {object}
 */
function createToggleForNode(
  node,
  {
    showText,
    hideText,
    linkClass = "",
    smallSize = 11,
    linkColor = "orange",
    startHidden = true,
    onToggle = () => {},
  }
) {
  const toggle = domParser.parseFromString(TOGGLE_TEMPLATE, "text/html").body
    .childNodes[0];
  toggle.setAttribute("show-text", showText);
  toggle.setAttribute("hide-text", hideText);
  toggle.style.color = linkColor;
  toggle.style.fontSize = smallSize;
  toggle.classList.add(...linkClass.split(/\s/));

  function show() {
    toggle.textContent = `- ${toggle.getAttribute("hide-text")} -`;
    toggle.setAttribute("state", "visible");
    node.style.display = "";
    // The callback may want to do something with the size of the revealed node, so call the callback after it's visible
    onToggle(true, node);
  }

  function hide() {
    toggle.textContent = `- ${toggle.getAttribute("show-text")} -`;
    toggle.setAttribute("state", "hidden");
    // The callback may want to do something with the size of the revealed node, so call the callback before it's hidden
    onToggle(false, node);
    node.style.display = "none";
  }

  toggle.addEventListener(
    "click",
    (event) => {
      if (toggle.getAttribute("state") === "visible") {
        hide();
      } else {
        show();
      }
    },
    true
  );

  if (startHidden) {
    hide();
  } else {
    show();
  }

  node.insertAdjacentElement("beforebegin", toggle);

  return toggle;
}

/**
 * Generate a callback for the `onToggle` function of a toggle element.
 * The callback will automatically resize the supplied iframe to grow or
 * shrink depending on whether the toggle is in the open state or closed state.
 *
 * @param {*} iframe
 * @returns {Function}
 */
function toggleCallbackFactory(iframe) {
  return (visible, node) => {
    const cs = iframe.contentWindow.getComputedStyle(node);
    const h =
      node.getBoundingClientRect().height +
      parseFloat(cs.marginTop) +
      parseFloat(cs.marginBottom);
    if (visible) {
      iframe.style.height = parseFloat(iframe.style.height) + h + "px";
    } else {
      iframe.style.height = parseFloat(iframe.style.height) - h + "px";
    }
  };
}

/**
 * Sleep for the specified number of milliseconds
 *
 * @param {number} ms - milliseconds to sleep
 */
async function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs `func()` asynchronously until `validator(func())` is truthy.
 * Sets progressively longer timeouts between calls to `func()` until
 * eventually erroring.
 *
 * @param {Function} func
 * @param {Function} validator
 * @returns {*}
 */
async function runUntilValid(func, validator) {
  const ret = func();
  if (validator(ret)) {
    return ret;
  }
  const TIMEOUTS = [0, 0, 10, 10, 10];
  for (const timeout of TIMEOUTS) {
    await sleep(timeout);
    const ret = func();
    if (validator(ret)) {
      return ret;
    }
  }
  throw new Error(
    `Waited for intervals of ${TIMEOUTS} milliseconds, but validator never passed`
  );
}

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
export class MessageIFrame extends React.Component {
  constructor(props) {
    super(props);
    this.index = index++;
    this.currentId = null;
    this.loading = false;
    this.onClickIframe = this.onClickIframe.bind(this);
    this._waitingForDom = false;
  }

  componentDidUpdate(prevProps) {
    let startLoad = false;
    // dueToExpansion is used so that we can indicate if this load is happening
    // as a result of an expansion or not. If it is a user expansion, we don't
    // want to scroll the message to view, since the user may be viewing somewhere
    // else.
    this.dueToExpansion = undefined;
    if (prevProps.id != this.props.id && this.props.expanded) {
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
        this.currentId != this.props.id ||
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
      if (prevProps.id != this.props.id) {
        this.iframe.src = "about:blank";
        this.currentId = null;
      }
      this.iframe.classList.add("hidden");
    }
    if (startLoad && isWebextension) {
      const docShell = this.iframe.contentWindow.docShell;
      docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
      const cv = docShell.contentViewer;
      // Not needed after Gecko 90.
      if ("hintCharacterSet" in cv) {
        cv.hintCharacterSet = "UTF-8";
        docShell.charset = "UTF-8";
        // This used to be kCharsetFromChannel = 11, however in 79/80 the code changed.
        // This still needs to be forced, because bug 829543 isn't fixed yet.
        cv.hintCharacterSetSource = kCharsetFromUserForced;
      }

      this.loading = true;
      this.currentId = this.props.id;
      this.props.dispatch(
        summaryActions.msgStreamMsg({
          docshell: this.iframe.contentWindow.docShell,
          dueToExpansion: this.dueToExpansion,
          id: this.props.id,
        })
      );
    }
  }

  componentDidMount() {
    if (!isWebextension) {
      // If we are running in a test environment or in the browser, we cannot
      // create iframes in the XUL namespace.
      this.iframe = this.div.ownerDocument.createElement("iframe");
      return;
    }
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
    this.div.appendChild(this.iframe);

    const docShell = this.iframe.contentWindow.docShell;
    docShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;
    const cv = docShell.contentViewer;
    // Not needed after Gecko 90.
    if ("hintCharacterSet" in cv) {
      // Thunderbird 78
      this._isTB91 = false;
      cv.hintCharacterSet = "UTF-8";
      docShell.charset = "UTF-8";
      // This used to be kCharsetFromChannel = 11, however in 79/80 the code changed.
      // This still needs to be forced, because bug 829543 isn't fixed yet.
      cv.hintCharacterSetSource = kCharsetFromUserForced;
      // Thunderbird 78.
      this.iframe.addEventListener("click", this.onClickIframe);
    } else {
      // Thunderbird 91.

      // We don't apply the click listener when in a tab as Thunderbird's
      // click handling already manages that.
      if (
        (!this.props.isInTab || this.props.isStandalone) &&
        window.browsingContext
      ) {
        window.browsingContext.embedderElement.addEventListener(
          "click",
          this.onClickIframe
        );
      }
      this._isTB91 = true;
    }

    this.registerListeners();
    if (this.props.expanded) {
      this.currentId = this.props.id;
      this.loading = true;
      this.dueToExpansion = false;
      this.props.dispatch(
        summaryActions.msgStreamMsg({
          docshell: docShell,
          id: this.props.id,
        })
      );
    } else {
      this.iframe.classList.add("hidden");
    }
  }

  componentWillUnmount() {
    if (this.loading) {
      this.props.dispatch(
        summaryActions.msgStreamLoadFinished({
          dueToExpansion: this.dueToExpansion,
        })
      );
      this.loading = false;
    }
    if (!this._loadListener) {
      return;
    }
    this.iframe.removeEventListener("load", this._loadListener, {
      capture: true,
    });
    delete this._loadListener;
    if (this._isTB91) {
      // Thunderbird 91
      window.browsingContext.embedderElement.removeEventListener(
        "click",
        this.onClickIframe
      );
      window.browsingContext.embedderElement.removeEventListener(
        "DOMContentLoaded",
        this._domloadListener,
        { capture: true }
      );
    } else {
      // Thunderbird 78
      window.removeEventListener("DOMContentLoaded", this._domloadListener, {
        capture: true,
      });
    }
    delete this._domloadListener;
  }

  registerListeners() {
    if (!this._loadListener) {
      this._loadListener = this._onLoad.bind(this);
      this.iframe.addEventListener("load", this._loadListener, {
        capture: true,
      });
      this._domloadListener = this._onDOMLoaded.bind(this);
      if (this._isTB91) {
        // Thunderbird 91 - this is due to the type=content change on multimessage,
        // we must break out to the parent browser and listen there.
        window.browsingContext.embedderElement.addEventListener(
          "DOMContentLoaded",
          this._domloadListener,
          { capture: true }
        );
      } else {
        // Thunderbird 78.
        window.addEventListener("DOMContentLoaded", this._domloadListener, {
          capture: true,
        });
      }
    }
  }

  async adjustHeight() {
    const doAdjustment = () => {
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
    };
    try {
      // When blockquotes are detected, an async function is run to compute
      // their height. We need to wait for this function to finish before we
      // adjust the height of the whole iframe. This is accomplished by waiting
      // for `this._waitingForDom` to be set to `false`.
      await runUntilValid(
        () => {},
        () => !this._waitingForDom
      );
      doAdjustment();
    } catch (e) {
      console.warn(
        "Possible race condition; timed out while trying to adjust iframe height",
        e
      );
      doAdjustment();
    }
  }

  _onLoad(event) {
    if (event.target.documentURI == "about:blank") {
      return;
    }
    // TODO: Handle BIDI

    this.adjustHeight();
    this.loading = false;
    this.props.dispatch(
      summaryActions.msgStreamLoadFinished({
        dueToExpansion: this.dueToExpansion,
        id: this.props.id,
        iframe: this.iframe,
      })
    );
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

  async detectQuotes(iframe) {
    // Launch various crappy pieces of code heuristics to
    // convert most common quoting styles to real blockquotes. Spoiler:
    // most of them suck.
    Quoting.normalizeBlockquotes(iframe.contentDocument);

    const getQuoteLength = async (node) => {
      function heightFromStyle(style) {
        return parseInt(style.height) / (parseInt(style.fontSize) * 1.5);
      }

      try {
        const style = iframe.contentWindow.getComputedStyle(node);
        // If the computed height returned by `getQuoteLength` is NaN,
        // that means the DOM hasn't had a chance to render it, and so it's
        // size cannot be computed. In this case, we set a timeout to let
        // the DOM render before we measure the height
        this._waitingForDom = true;
        const height = await runUntilValid(
          () => heightFromStyle(style),
          (val) => val && !Number.isNaN(val)
        );
        this._waitingForDom = false;
        return height;
      } catch (e) {
        // message arrived and window is not displayed, arg,
        // cannot get the computed style, BAD
      }
      return undefined;
    };

    // If the first email contains quoted text, it was probably forwarded to us
    // and we don't have the previous email for reference. In this case, don't normalize
    // the quote. See:
    // https://github.com/thunderbird-conversations/thunderbird-conversations/issues/179
    if (this.props.initialPosition > 0) {
      const win = iframe.contentWindow;
      // We look for the first blockquote that is long enough to be hidden
      for (const blockquote of win.document.querySelectorAll("blockquote")) {
        const quoteLength = await getQuoteLength(blockquote);
        if (quoteLength > this.props.prefs.hideQuoteLength) {
          createToggleForNode(blockquote, {
            hideText: browser.i18n.getMessage("messageBody.hideQuotedText"),
            showText: browser.i18n.getMessage("messageBody.showQuotedText"),
            linkClass: "showhidequote",
            smallSize: this.props.prefs.tweakChrome
              ? this.props.defaultFontSize * this.props.tenPxFactor * 1.1
              : Math.round((100 * this.props.defaultFontSize * 11) / 12) / 100,
            linkColor: "orange",
            onToggle: toggleCallbackFactory(iframe),
          });
          // We only put a show/hide button on the first suitable quote,
          // so if we've made it thus far, we're done.
          break;
        }
      }
    }
  }

  detectSigs(iframe) {
    if (!this.props.prefs.hideSigs) {
      return;
    }

    const win = iframe.contentWindow;
    const sigNode = win.document.querySelector(".moz-txt-sig");

    if (sigNode) {
      createToggleForNode(sigNode, {
        hideText: browser.i18n.getMessage("messageBody.hideSigText"),
        showText: browser.i18n.getMessage("messageBody.showSigText"),
        linkClass: "showhidesig",
        smallSize: this.props.prefs.tweakChrome
          ? this.props.defaultFontSize * this.props.tenPxFactor * 1.1
          : Math.round((100 * this.props.defaultFontSize * 11) / 12) / 100,
        linkColor: "rgb(56, 117, 215)",
        onToggle: toggleCallbackFactory(iframe),
      });
    }
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

  async _onDOMLoaded(event) {
    if (
      event.target != this.iframe.contentDocument ||
      event.target.documentURI == "about:blank"
    ) {
      return;
    }
    const iframeDoc = this.iframe.contentDocument;
    let styleRules = this.tweakFonts(iframeDoc);
    if (
      !(this.props.realFrom && this.props.realFrom.includes("bugzilla-daemon"))
    ) {
      await this.detectQuotes(this.iframe);
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
    // Only take clicks for this particular iframe and Thunderbird 91
    if (
      this._isTB91 &&
      event.target.ownerDocument.URL != this.iframe.contentDocument.URL
    ) {
      return;
    }
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
  id: PropTypes.number.isRequired,
  isInTab: PropTypes.bool.isRequired,
  isStandalone: PropTypes.bool.isRequired,
  initialPosition: PropTypes.number.isRequired,
  smimeReload: PropTypes.bool.isRequired,
  tenPxFactor: PropTypes.number.isRequired,
  prefs: PropTypes.object.isRequired,
  realFrom: PropTypes.string.isRequired,
};
