/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
const {fixIterator} = Cu.import("resource:///modules/iteratorUtils.jsm", {});

let global = this;
let Log;

let hook = {
  onMessageBeforeStreaming: function _embedsHook_onBeforeSreaming(aMessage) {
  },

  /**
   * Walks the DOM tree of the message, examines links, and tries to detect
   * stuff it knows how to embed, such as youtube videos...
   */
  onMessageStreamed: function _embedsHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow) {
    // First get the basic elements of the message.
    let iframe = aDomNode.getElementsByTagName("iframe")[0];
    let iframeDoc = iframe.contentDocument;
    let links = iframeDoc.getElementsByTagName("a");
    // Don't detect links in quotations.
    for (let x of iframe.querySelectorAll("blockquote a")) {
      x.skip = true;
    }
    let seen = {};
    // Examine all links in the message.
    for (let a of links) {
      if (a.skip || (a.href in seen))
        continue;
      if (this.tryOEmbed(a, aDomNode))
        seen[a.href] = null;
    }
  },

  tryOEmbed: function (a, aDomNode) {
    let url;
    try {
      url = Services.io.newURI(a.href, null, null);
      url.QueryInterface(Ci.nsIURL);
    } catch (e) {
      //Log.debug(e);
      return false;
    }
    let self = this;
    if (url.host == "flickr.com" || url.host == "www.flickr.com") {
      let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
      req.addEventListener("load", function (event) {
        Log.debug("Load event", req.responseXML, req.responseText);
        if (!req.responseXML)
          return;
        let getAttr = (attrName) =>
          req.responseXML.getElementsByTagName(attrName)[0].textContent;
        self.insertDesc(getAttr("title"), getAttr("author_name"), getAttr("url"), a.href, aDomNode);
      });
      req.open("GET", "http://www.flickr.com/services/oembed/?url="+getMail3Pane().encodeURIComponent(a.href));
      req.send();
      return true;
    }
  },

  insertDesc: function (title, author, url, originalUrl, aDomNode) {
    if (!aDomNode)
      return;

    try {
      // Let's build the nodes
      let document = aDomNode.ownerDocument;
      let a = document.createElement("a");
      a.addEventListener("click", function () {
        getMail3Pane().document.getElementById("tabmail").openTab("contentTab", {
          contentPage: originalUrl,
        });
      }, false);
      a.classList.add("link");
      let img = document.createElement("img");
      img.setAttribute("src", url);
      a.appendChild(img);
      let br = document.createElement("br");
      let span = document.createElement("span");
      span.style.fontStyle = "italic";
      span.textContent = title;
      let span2 = document.createElement("span");
      span2.textContent = " by "+author;

      // Insert them
      let container = aDomNode.getElementsByClassName("embedsContainer")[0];
      let div = document.createElement("div");
      div.style.marginTop = "20px";
      div.style.overflow = "auto";
      for (let e of [a, br, span, span2])
        div.appendChild(e);
      container.appendChild(div);
    } catch (e) {
      Log.debug(e);
      dumpCallStack(e);
    }
  },
}

let didStuff = false;

/**
 * This function is called as soon as we think we're able to load Conversation's
 * JSMs...
 */
function doStuff() {
  if (didStuff)
    return;

  try {
    /* import-globals-from ../../modules/stdlib/msgHdrUtils.js */
    Cu.import("chrome://conversations/content/modules/stdlib/msgHdrUtils.js", global);
    /* import-globals-from ../../modules/hook.js */
    Cu.import("chrome://conversations/content/modules/hook.js", global);
    /* import-globals-from ../../modules/prefs.js */
    Cu.import("chrome://conversations/content/modules/prefs.js", global);
    /* import-globals-from ../../modules/log.js */
    Cu.import("chrome://conversations/content/modules/log.js", global);

    Log = setupLogging("Conversations.OEmbed");
    Log.debug("Registering OEmbed plugin for Conversations...");

    registerHook(hook);
  } catch (e) {
    dump(e+"\n");
    dump(e.stack+"\n");
  }

  didStuff = true;
}

function startup(aData, aReason) {
  try {
    // If we find a window open, that means that Thunderbird has been started
    // already, so go ahead, and do stuff...
    for (let w of fixIterator(Services.wm.getEnumerator("mail:3pane"))) {
      doStuff();
    }

    // Otherwise, wait for the first window to be opened. That should be late
    // enough that we're able to load Conversation's JSMs.
    Services.ww.registerNotification({
      observe: function (aSubject, aTopic, aData) {
        if (aTopic == "domwindowopened")
          doStuff();
      }
    });
  } catch (e) {
    dump(e+"\n");
    dump(e.stack+"\n");
  }
}

function shutdown(data, reason) {
  removeHook(hook);
}

function install(data, reason) {
}

function uninstall(data, reason) {
}
