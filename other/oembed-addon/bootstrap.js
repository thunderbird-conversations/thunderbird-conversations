/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");

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
    [x.skip = true
      for each ([, x] in Iterator(iframeDoc.querySelectorAll("blockquote a")))];
    let seen = {};
    // Examine all links in the message.
    for each (let [, a] in Iterator(links)) {
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
        let getAttr = function (attrName)
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
      for each (let e in [a, br, span, span2])
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
    Cu.import("resource://conversations/stdlib/msgHdrUtils.js", global);
    Cu.import("resource://conversations/hook.js", global);
    Cu.import("resource://conversations/prefs.js", global);
    Cu.import("resource://conversations/log.js", global);

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
    for each (let w in fixIterator(Services.wm.getEnumerator("mail:3pane"))) {
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
