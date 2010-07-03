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
 * The Original Code is http://mxr.mozilla.org/comm-central/source/mozilla/netwerk/test/unit/test_authentication.js?raw=1
 *
 * The Initial Developer of the Original Code is
 *  The Mozilla Project
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Jonathan Protzenko
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

var EXPORTED_SYMBOLS = ["md5"]

function bytesFromString(str) {
 var converter =
   Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
     .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
 converter.charset = "UTF-8";
 var data = converter.convertToByteArray(str);
 return data;
}

// return the two-digit hexadecimal code for a byte
function toHexString(charCode) {
 return ("0" + charCode.toString(16)).slice(-2);
}

function md5(str) {
 var data = bytesFromString(str);
 var ch = Components.classes["@mozilla.org/security/hash;1"]
            .createInstance(Components.interfaces.nsICryptoHash);
 ch.init(Components.interfaces.nsICryptoHash.MD5);
 ch.update(data, data.length);
 var hash = ch.finish(false);
 return [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
}
