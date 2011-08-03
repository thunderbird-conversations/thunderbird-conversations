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

Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/gloda/mimemsg.js"); // for MsgHdrToMimeMessage
Cu.import("resource://conversations/stdlib/msgHdrUtils.js");
Cu.import("resource://conversations/stdlib/misc.js");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Gallery");
let strings = new StringBundle("chrome://conversations/locale/message.properties");

let gallery = null;

function Gallery (aMsg) {
  this.msgHdr = aMsg;
  this.subject = null;
  this.attachments = null;
}

Gallery.prototype = {
  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   */
  load: function () {
    MsgHdrToMimeMessage(this.msgHdr, this, function (aMsgHdr, aMimeMsg) {
      let attachments = aMimeMsg.allAttachments;
      attachments =
        attachments.filter(function (x) x.contentType.indexOf("image/") === 0);
      this.attachments = attachments;
      this.subject = aMimeMsg.headers.subject;
      this.output();
    }, true, {
      partsOnDemand: true,
      examineEncryptedParts: true,
    });
  },

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the jquery-tmpl template and then appends the result to the root
   *  DOM node.
   */
  output: function (aGlodaMessages) {
    let messenger = Cc["@mozilla.org/messenger;1"]
                    .createInstance(Ci.nsIMessenger);
    let data = [];
    let n = this.attachments.length;
    Log.debug(n, "attachments in this gallery view");
    for each (let [i, att] in Iterator(this.attachments)) {
      data.push({
        url: att.url,
        name: att.name,
        size: messenger.formatFileSize(att.size),
        i: i+1,
        n: n,
      });
    }

    // Output the data
    $("#imageTemplate").tmpl(data).appendTo($(".images"));
    // This will also update the tab title
    document.title = strings.get("galleryTitle").replace("#1", this.subject);
  },
};

$(document).ready(function () {
  // Parse URL components
  let param = "?uri="; // only one param
  let url = document.location.href;
  let uri = url.substr(url.indexOf(param) + param.length, url.length);

  // Create the Gallery object.
  let msgHdr = msgUriToMsgHdr(uri);
  if (msgHdr && msgHdr.messageId) {
    gallery = new Gallery(msgHdr);
    gallery.load();
  } else {
    document.getElementsByClassName("images")[0].textContent =
      strings.get("messageMovedOrDeletedGallery2");
  }
});
