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

let Log; // filled from wrapper.js
let strings; // filled from wrapper.js

let viewer;

function Viewer() {
  this.pdfDoc = null;
  this.curPage = -1;
}

Viewer.prototype = {

  load: function (data) {
    this.pdfDoc = new PDFJS.PDFDoc(data);
    this.switchToPage(1);
  },

  switchToPage: function (aPageNum) {
    Log.debug("Switching to page", aPageNum);

    let page = this.pdfDoc.getPage(aPageNum);
    this.curPage = aPageNum;
    let scale = 1.5;

    //
    // Prepare canvas using PDF page dimensions
    //
    let canvas = document.getElementById('the-canvas');
    let context = canvas.getContext('2d');
    canvas.height = page.height * scale;
    canvas.width = page.width * scale;

    //
    // Render PDF page into canvas context
    //
    page.startRendering(context);

    document.getElementById("count").innerHTML = aPageNum + " of " + this.pdfDoc.numPages;
  },

  prevPage: function () {
    if (this.curPage > 1)
      this.switchToPage(this.curPage - 1);
  },

  nextPage: function () {
    if (this.curPage < this.pdfDoc.numPages)
      this.switchToPage(this.curPage + 1);
  },
};

// Called from the outer wrapper JS code.
function init(aData) {
  viewer = new Viewer();
  viewer.load(aData);
}

