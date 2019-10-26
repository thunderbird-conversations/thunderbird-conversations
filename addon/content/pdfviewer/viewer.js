/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

// Called from the outer wrapper JS code.
/* exported init */

// Imported via viewer.xhtml -> pdf.js
/* global pdfjsLib */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "chrome://conversations/content/vendor/pdf.worker.js";

let viewer;

function Viewer() {
  this.pdfDoc = null;
  this.curPage = -1;
  let form = document.getElementById("count");
  let pageNumberBox = document.getElementById("pageNumberBox");
  this._initPageForm(form, pageNumberBox);
}

Viewer.prototype = {
  async load(data) {
    let self = this;
    let status = document.getElementById("status");

    try {
      let pdfDocument = await pdfjsLib.getDocument(data).promise;

      self.pdfDoc = pdfDocument;
      document.getElementById("numPages").textContent = self.pdfDoc.numPages;
      self.switchToPage(1);
      status.classList.remove("loading");
      status.classList.add("loaded");
    } catch (error) {
      document.getElementById("error").textContent = error;
      status.classList.remove("loading");
      status.classList.add("error");
      throw error;
    }
  },

  switchToPage(aPageNum) {
    let self = this;

    this.pdfDoc.getPage(aPageNum).then(function(page) {
      self.curPage = aPageNum;
      let scale = 1.5;
      let viewport = page.getViewport({ scale });

      //
      // Prepare canvas using PDF page dimensions
      //
      let canvas = document.getElementById("the-canvas");
      let context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      //
      // Render PDF page into canvas context
      //
      let renderContext = {
        canvasContext: context,
        viewport,
      };
      page.render(renderContext);

      document.getElementById("pageNumberBox").value = aPageNum;
    });
  },

  prevPage() {
    if (this.curPage > 1) {
      this.switchToPage(this.curPage - 1);
    }
  },

  nextPage() {
    if (this.curPage < this.pdfDoc.numPages) {
      this.switchToPage(this.curPage + 1);
    }
  },

  _initPageForm(pageForm, numBox) {
    let self = this;
    pageForm.addEventListener("submit", function(event) {
      let page = parseInt(numBox.value, 10);
      if (
        !isNaN(page) &&
        page != self.curPage &&
        page > 0 &&
        page <= self.pdfDoc.numPages
      ) {
        self.switchToPage(page);
      } else {
        numBox.value = self.curPage;
      }
      event.preventDefault();
    });
  },
};

function init({ chunks }) {
  // Strangely enough, I can't get my typed array to cross the chrome/content
  // boundary, so let's make the data cross the boundary as a chunk of
  // strings...
  let length = chunks.reduce((acc, v) => acc + v.length, 0);
  let buffer = new ArrayBuffer(length);
  let array = new Uint8Array(buffer);
  let offset = 0;
  // So [Iterator] doesn't seem to like too much the fact that [chunks] has
  // crossed the chrome/content boundary, and is unable to work properly.
  // Sigh... it stopped working at some point between Gecko 16 and Gecko 18,
  // probably has something to do with the fact that [__exposedProps__] now
  // seems to be mandatory. Anywho, it works.
  for (let i = 0; i < chunks.length; ++i) {
    let chunk = chunks[i];
    array.set(chunk, offset);
    offset += chunk.length;
  }

  viewer = new Viewer();
  viewer.load(buffer).catch(console.error);
}
