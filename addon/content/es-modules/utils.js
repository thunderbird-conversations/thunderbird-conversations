/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Take a name and extract initials from it.
 * If `name` is an email address, get the part before the @.
 * Then, capitalize the first letter of the first and last word (or the first
 * two letters of the first word if only one exists).
 *
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  name = name.trim().split("@")[0];
  let words = name.split(/[ .\-_]/).filter(function (word) {
    return word;
  });
  let initials = "??";
  let n = words.length;
  if (n == 1) {
    initials = words[0].substr(0, 2);
  } else if (n > 1) {
    initials = fixedCharAt(words[0], 0) + fixedCharAt(words[n - 1], 0);
  }
  return initials.toUpperCase();
}

/**
 * Hash an email address to produce a color. The same email address will
 * always return the same color.
 *
 * @param {string} email
 * @returns {string} - valid css hsl(...) string
 */
export function freshColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    let chr = email.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash &= 0xffff;
  }
  let hue = Math.floor((360 * hash) / 0xffff);

  // try to provide a consistent lightness across hues
  let lightnessStops = [48, 25, 28, 27, 62, 42];
  let j = Math.floor(hue / 60);
  let l1 = lightnessStops[j];
  let l2 = lightnessStops[(j + 1) % 6];
  let lightness = Math.floor((hue / 60 - j) * (l2 - l1) + l1);

  return "hsl(" + hue + ", 70%, " + Math.floor(lightness) + "%)";
}

// Taken from
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt#Fixing_charAt()_to_support_non-Basic-Multilingual-Plane_(BMP)_characters
function fixedCharAt(str, idx) {
  var ret = "";
  str += "";
  var end = str.length;

  var surrogatePairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  while (surrogatePairs.exec(str) != null) {
    var li = surrogatePairs.lastIndex;
    if (li - 2 < idx) {
      idx++;
    } else {
      break;
    }
  }

  if (idx >= end || idx < 0) {
    return "";
  }

  ret += str.charAt(idx);

  if (
    /[\uD800-\uDBFF]/.test(ret) &&
    /[\uDC00-\uDFFF]/.test(str.charAt(idx + 1))
  ) {
    // Go one further, since one of the "characters" is part of a surrogate pair
    ret += str.charAt(idx + 1);
  }
  return ret;
}
