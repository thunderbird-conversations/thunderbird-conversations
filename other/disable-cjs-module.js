///////////////////////////////////////////////////////////////////////
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// In node.js, mixing CJS and EJS style modules causes problems. Prepending
// this code to a UMD module, will disable CJS module loading.

/* eslint-disable */
if (typeof exports !== "undefined") {
  exports = void 0;
}
///////////////////////////////////////////////////////////////////////
