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

var EXPORTED_SYMBOLS = ['PluginHelpers']

/**
 * This file just contains helpers for our Gloda plugins. The function in
 *  PluginHelpers are used in the gloda attribute providers, as well as in the
 *  main message code that kicks in when the message hasn't been indexed by
 *  gloda yet (see message.js).
 */

Components.utils.import("resource:///modules/gloda/utils.js");

const gsfnRegexp = /^(.+)(?:, an employee of Mozilla Messaging,)? (?:replied to|commented on|just asked)/;
const gsfnFrom = "Mozilla Messaging <noreply.mozilla_messaging@getsatisfaction.com>";

const ghRegexp = /^(?:From: (.*)|(.*) reported an issue)/;
const ghFrom = "GitHub <noreply@github.com>";

let PluginHelpers = {
  // About to do more special-casing here? Please check out the corresponding
  //  code in contact.js and make sure you modify it too.
  alternativeSender: function _PluginHelpers_alternativeSender(aRawReps) {
    let aMimeMsg = aRawReps.mime;
    let aMsgHdr = aRawReps.header;

    // This header is a bare email address
    if (aMimeMsg && ("x-bugzilla-who" in aMimeMsg.headers))
        return aMimeMsg.headers["x-bugzilla-who"];

    // The thing is, the template caches the contacts according to their
    // emails, so we need to make sure the email address is unique for each
    // person (otherwise Person A <email> is cached with email as the key, and
    // Person B <sameemail> appears as Person A. See contact.js
    let uniq = function (s) GlodaUtils.md5HashString(s).substring(0, 8);

    // We sniff for a name
    if (aMimeMsg && aMimeMsg.headers["from"] == gsfnFrom) {
      let body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
      let m = body.match(gsfnRegexp);
      if (m && m.length)
        return (m[1] + " <" + uniq(m[1]) + "@getsatisfaction.com>");
    }

    if (aMimeMsg && aMimeMsg.headers["from"] == ghFrom) {
      let body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
      let m = body.match(ghRegexp);
      // I'll never understand how regexps really work...
      let name = m && m.length && (m[1] || m[2]);
      if (name)
        return (name + " <" + uniq(name) + "@github.com>");
    }

    return null;
  },
};
