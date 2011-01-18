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

var EXPORTED_SYMBOLS = [
  'groupArray', 'joinWordList', 'iconForMimeType',
]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

/**
 * Group some array elements according to a key function
 * @param aItems The array elements (or anything Iterable)
 * @param aFn The function that take an element from the array and returns an id
 * @return an array of arrays, with each inner array containing all elements
 *  sharing the same key
 */
function groupArray(aItems, aFn) {
  let groups = {};
  let orderedIds = [];
  for each (let [i, item] in Iterator(aItems)) {
    let id = aFn(item);
    if (!groups[id]) {
      groups[id] = [item];
      orderedIds.push(id);
    } else {
      groups[id].push(item);
    }
  }
  return [groups[id] for each ([, id] in Iterator(orderedIds))];
}

// Joins together names and format them as "John, Jane and Julie"
function joinWordList (aElements, aInsertHtml) {
  let wrap = aInsertHtml
    ? function (x) "<span>" + x + "</span>"
    : function (x) x
  ;
  let l = aElements.length;
  if (l == 0)
    return "";
  else if (l == 1)
    return aElements[0];
  else {
    let hd = aElements.slice(0, l - 1);
    let tl = aElements[l-1];
    return hd.join(wrap(", ")) + wrap(" and ") + tl;
  }
}

let mapping = {
  "application/msword": "x-office-document",
  "application/vnd.ms-excel": "x-office-spreadsheet",
  "application/vnd.ms-powerpoint": "x-office-presentation",
  "application/rtf": "x-office-document",
  "video/": "video-x-generic",
  "audio/": "audio-x-generic",
  "image/": "image-x-generic",
  //"message/": "email",
  "text/": "text-x-generic",
  "text/x-vcalendar": "x-office-calendar",
  "text/x-vcard": "x-office-address-book",
  "text/html": "text-html",
  "application/zip": "package-x-generic",
  "application/bzip2": "package-x-generic",
  "application/x-gzip": "package-x-generic",
  "application/x-tar": "package-x-generic",
  "application/x-compressed": "package-x-generic",
};

function iconForMimeType (aMimeType) {
  for each (let [k, v] in Iterator(mapping)) {
    if (aMimeType.indexOf(k) === 0)
      return v+".svg";
  }
  return "gtk-file.png";
}
