/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const attachmentActions = {
  previewAttachment({ id, name, partName, url, isPdf, maybeViewable }) {
    return async (dispatch, getState) => {
      if (maybeViewable) {
        let msgUri = await browser.conversations.getMessageUriForId(id);
        let searchParams = new URLSearchParams({
          msgUri,
          partName,
        });
        await browser.tabs.create({
          url: `/gallery/index.html?${searchParams.toString()}`,
          windowId: getState().summary.windowId,
        });
      } else if (isPdf) {
        browser.conversations.createTab({
          url:
            "chrome://conversations/content/pdfviewer/wrapper.xhtml?uri=" +
            encodeURIComponent(url) +
            "&name=" +
            encodeURIComponent(name),
          type: "chromeTab",
          windowId: getState().summary.windowId,
        });
      }
    };
  },
  downloadAll({ id }) {
    return async () => {
      await browser.conversations.downloadAllAttachments(id);
    };
  },
  downloadAttachment({ id, attachmentUrl }) {
    return async () => {
      await browser.conversations.downloadAttachment(id, attachmentUrl);
    };
  },
  openAttachment({ id, attachmentUrl }) {
    return async () => {
      await browser.conversations.openAttachment(id, attachmentUrl);
    };
  },
  detachAttachment({ id, attachmentUrl, shouldSave }) {
    return async () => {
      await browser.conversations.detachAttachment(
        id,
        attachmentUrl,
        shouldSave
      );
    };
  },
  showGalleryView({ id }) {
    return async (dispatch, getState) => {
      let msgUri = await browser.conversations.getMessageUriForId(id);
      await browser.tabs.create({
        url: "/gallery/index.html?msgUri=" + encodeURIComponent(msgUri),
        windowId: getState().summary.windowId,
      });
    };
  },
};
