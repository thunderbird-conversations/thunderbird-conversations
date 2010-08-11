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
 * The Original Code is Mail utility functions for GMail Conversation View
 *
 * The Initial Developer of the Original Code is
 * Jonathan Protzenko
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

var EXPORTED_SYMBOLS = ['MimeMessageToHTML', 'MimeMessageGetAttachments']

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
Components.utils.import("resource://app/modules/gloda/mimemsg.js");

/**
 * This function concatenates every text/html part it finds inside a Mime
 * message.
 * @param {MimeMessage} aMsg The MimeMessage instance that should be examined.
 * @return {[bool, string]} The first argument of the array tells whether an
 *  text/html part was found. The second argument the html contents. Use
 *  destructuring assignment!
 * */
function MimeMessageToHTML(aMsg) {
  if (aMsg instanceof MimeMessage || aMsg instanceof MimeContainer) { // is this a container ?
    let buf = [];
    let buf_i = 0;
    for each (p in aMsg.parts) {
      let [isHtml, html] = MimeMessageToHTML(p);
      if (isHtml)
        buf[buf_i++] = html;
    }
    if (buf_i > 0)
      return [true, buf.join("")];
    else
      return [false, ""]
  } else if (aMsg instanceof MimeBody) { // we only want to examinate bodies
    if (aMsg.contentType == "text/html") {
      return [true, aMsg.body];
    } else {
      return [false, ""]; // we fail here
    }
  } else {
    return [false, ""];
  }
}

/**
 * Recursively walk down a MimeMessage to find something that looks like an
 * attachment.
 * @param {MimeMessage} aMsg The MimeMessage to examine
 * @return {MimeMessageAttachment list} All the "real" attachments that have
 *  been found */
function MimeMessageGetAttachments(aMsg) {
  /* This for newer glodas that include this special hook (otherwise
   * message/rfc822 inner parts are not treated as attachments. */
  let attachments = aMsg.allUserAttachments || aMsg.allAttachments;
  /* This first step filters out "Part 1.2"-like attachments. */
  attachments = attachments.filter(function (x) x.isRealAttachment);
  return attachments;
}

