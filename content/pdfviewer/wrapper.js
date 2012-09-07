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

Cu.import("resource://gre/modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource://conversations/modules/log.js");
Cu.import("resource://conversations/modules/stdlib/misc.js");

let Log = setupLogging("Conversations.PdfViewer");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

let wrapper;

function Wrapper(aUrl) {
  this.url = aUrl;
  this.pdfDoc = null;
  this.curPage = -1;
}

Wrapper.prototype = {
  /**
   * The XMLHttpRequest thing doesn't seem to work properly, so use our own
   * little function to get the contents of the attachment into a TypedArray.
   */
  _download: function (k) {
    let url = Services.io.newURI(this.url, null, null);
    let channel = Services.io.newChannelFromURI(url);
    let chunks = [];
    let listener = {
      onStartRequest: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext) {
      },

      onStopRequest: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext, /* int */ aStatusCode) {
        k(chunks);
      },

      onDataAvailable: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext,
          /* nsIInputStream */ aStream, /* int */ aOffset, /* int */ aCount) {
        // Fortunately, we have in Gecko 2.0 a nice wrapper
        let data = NetUtil.readInputStreamToString(aStream, aCount);
        Log.debug(data);
        // Now each character of the string is actually to be understood as a byte
        // So charCodeAt is what we want here...
        let array = [];
        for (let i = 0; i < data.length; ++i)
          array[i] = data.charCodeAt(i);
        // Yay, good to go!
        chunks.push(array);
      },

      QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIStreamListener,
        Ci.nsIRequestObserver])
    };
    channel.asyncOpen(listener, null);
  },

  load: function () {
    Log.debug("Downloading", this.url);

    this._download(function (chunks) {
      let browser = document.getElementById("browser");
      browser.addEventListener("load", function load_handler () {
        browser.removeEventListener("load", load_handler, true);
        let w = browser.contentWindow.wrappedJSObject;
        // expose the [Log] object
        w.Log = setupLogging("Conversations.PdfViewer");
        w.Log.__exposedProps__ = { debug: "r" };
        // pass the right object to the init function
        w.init({ chunks: chunks, __exposedProps__: { chunks: 'r' }});
      }, true);
      // Load from a resource:// URL so that it doesn't have chrome privileges.
      browser.loadURI("resource://conversations/content/pdfviewer/viewer.xhtml", null, null);
    }.bind(this));
  },

};

window.addEventListener("load", function (event) {
  let params = decodeUrlParameters(document.location.href);
  let uri = decodeURIComponent(params.uri);
  let name = decodeURIComponent(params.name);
  document.title = name;

  wrapper = new Wrapper(uri);
  wrapper.load();
}, false);

