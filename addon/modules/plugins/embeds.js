/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["Embeds"];

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  registerHook: "resource://conversations/modules/hook.js",
  Prefs: "resource://conversations/modules/prefs.js",
  Services: "resource://gre/modules/Services.jsm",
  setupLogging: "resource://conversations/modules/log.js",
  StringBundle: "resource:///modules/StringBundle.js",
});

let strings = new StringBundle("chrome://conversations/locale/message.properties");

let Log = setupLogging("Conversations.Modules.Embeds");

let embedsHook = {
  onMessageBeforeStreaming: function _embedsHook_onBeforeSreaming(aMessage) {
  },

  /* eslint-disable no-multi-spaces */
  // From http://stackoverflow.com/questions/5830387/php-regex-find-all-youtube-video-ids-in-string/5831191#5831191
  YOUTUBE_REGEXP: new RegExp(
    "(?:https?://)?"           + // Optional scheme. Either http or https
    "(?:www\\.)?"              + // Optional www subdomain
    "(?:"                      + // Group host alternatives
    "youtu\\.be/"              + // Either youtu.be,
    "|youtube\\.com"           + // or youtube.com
    "(?:"                      + // Group path alternatives
    "/embed/"                  + // Either /embed/
    "|/v/"                     + // or /v/
    "|/watch\\?v="             + // or /watch\?v=
    "|/user/\\S+/"             + // or /user/username#p/u/1/
    "|/ytscreeningroom\?v="    + // or ytscreeningroom
    ")"                        + // End path alternatives.
    ")"                        + // End host alternatives.
    "([\\w\\-]{10,12})"        + // $1: Allow 10-12 for 11 char youtube id.
    "\\b"                      + // Anchor end to word boundary.
    "[?=&\\w]*"                + // Consume any URL (query) remainder.
    "(?!"                      + // But don\'t match URLs already linked.
    '[\\\'"][^<>]*>'           + // Not inside a start tag,
    "|</a>"                    + // or <a> element text contents.
    ")"                          // End negative lookahead assertion.
  ),
  /* eslint-enable no-multi-spaces */

  /**
   * Walks the DOM tree of the message, examines links, and tries to detect
   * stuff it knows how to embed, such as youtube videos...
   */
  onMessageStreamed: function _embedsHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow) {
    // There's a pref that controls whether we're enabled or not.
    if (!Prefs.add_embeds)
      return;
    // First get the basic elements of the message.
    let iframe = aDomNode.getElementsByTagName("iframe")[0];
    let iframeDoc = iframe.contentDocument;
    let links = iframeDoc.getElementsByTagName("a");
    // Don't detect links in quotations.
    for (let x of iframeDoc.querySelectorAll("blockquote a")) {
      x.skip = true;
    }
    let seen = {};
    // Examine all links in the message.
    for (let a of links) {
      if (a.skip)
        continue;
      let youTubeId;
      if ((youTubeId = this.tryYouTube(a, aDomNode, seen)))
        seen[youTubeId] = null;
      if (!(a.href in seen) && this.tryGoogleMaps(a, aDomNode))
        seen[a.href] = null;
    }
  },

  tryYouTube: function _embeds_youtube(a, aDomNode, seen) {
    let matches = a.href.match(this.YOUTUBE_REGEXP);
    if (matches && matches.length && !(matches[1] in seen)) {
      let videoId = matches[1];
      Log.debug("Found a youtube video, video-id", videoId);
      this.insertEmbed(strings.get("foundYouTube"), "640", "385",
        "http://www.youtube.com/embed/" + videoId, aDomNode);
      return videoId;
    }

    return null;
  },

  GMAPS_REGEXP: /q=([^&]+)(&|$)/,

  tryGoogleMaps: function _embeds_googlemaps(a, aDomNode) {
    let url;
    try {
      url = Services.io.newURI(a.href);
      url.QueryInterface(Ci.nsIURL);
    } catch (e) {
      // Log.debug(e);
      return false;
    }
    if (url.host == "maps.google.com") {
      let matches = url.query.match(this.GMAPS_REGEXP);
      if (matches && matches.length) {
        let q = matches[1];
        this.insertEmbed(strings.get("foundGoogleMaps"),
          "600", "450",
          "https://www.google.com/maps/embed/v1/place?key=AIzaSyCUitgLn5uy0kcU1pneLGiEfI_f0nhMvXw&q=" + q,
          aDomNode
        );
        return true;
      }
    }
    return false;
  },

  insertEmbed: function _embeds_insert(str, width, height, src, aDomNode) {
    // Let's build the nodes
    let document = aDomNode.ownerDocument;
    let header = document.createElement("div");
    header.classList.add("attachHeader");
    header.textContent = str;
    let br = document.createElement("br");
    let iframe = document.createElementNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
      "iframe");
    iframe.setAttribute("type", "content");
    iframe.style.width = width + "px";
    iframe.style.height = height + "px";
    iframe.style.marginTop = "3px";
    iframe.style.border = "0";
    iframe.setAttribute("src", src);
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowfullscreen", "allowfullscreen");
    // Insert them
    let container = aDomNode.getElementsByClassName("embedsContainer")[0];
    let div = document.createElement("div");
    div.style.marginTop = "20px";
    for (let e of [header, br, iframe])
      div.appendChild(e);
    container.appendChild(div);
  },
};

var Embeds = {
  init() {
    registerHook(embedsHook);
  },
};
