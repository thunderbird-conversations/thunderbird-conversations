/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const attachmentActions = {
  previewAttachment({ id, name, partName }) {
    return async (dispatch, getState) => {
      let msgUri = await browser.conversations.getMessageUriForId(id);
      let searchParams = new URLSearchParams({
        msgUri,
        partName,
      });
      await browser.tabs.create({
        url: `/gallery/index.html?${searchParams.toString()}`,
        windowId: getState().summary.windowId,
      });
    };
  },
  downloadAll({ id, partNames }) {
    return async (dispatch, getState) => {
      let state = getState();
      let options = {
        msgId: id,
        partNames,
      };
      if (state.summary.isStandalone) {
        options.winId = state.summary.windowId;
      } else {
        options.tabId = state.summary.tabId;
      }
      await browser.conversations.downloadAllAttachments(options);
    };
  },
  downloadAttachment({ id, partName }) {
    return async (dispatch, getState) => {
      let state = getState();
      let options = {
        msgId: id,
        partName,
      };
      if (state.summary.isStandalone) {
        options.winId = state.summary.windowId;
      } else {
        options.tabId = state.summary.tabId;
      }
      await browser.conversations.downloadAttachment(options);
    };
  },
  openAttachment({ id, partName }) {
    return async (dispatch, getState) => {
      let state = getState();
      let options = {
        msgId: id,
        partName,
      };
      if (state.summary.isStandalone) {
        options.winId = state.summary.windowId;
      } else {
        options.tabId = state.summary.tabId;
      }

      // openAttachment doesn't work for tabs:
      // xref https://bugzilla.mozilla.org/show_bug.cgi?id=1849453
      // For the standalone window, we need to manage it ourselves because
      // of the requirement to pass the browser/browsingContext.
      if (state.summary.isInTab || state.summary.isStandalone) {
        return browser.conversations.openAttachment(options);
      }
      return browser.messages.openAttachment(id, partName, state.summary.tabId);
    };
  },
  detachAttachment({ id, fileName = null, partName, shouldSave }) {
    return async (dispatch, getState) => {
      if (!shouldSave) {
        if (
          window.confirm(
            browser.i18n.getMessage("attachments.delete.warning", [
              `\n${fileName}\n`,
            ])
          )
        ) {
          await browser.messages.deleteAttachments(id, [partName]);
        }
        return;
      }

      let state = getState();
      let options = {
        msgId: id,
        partName,
      };
      if (state.summary.isStandalone) {
        options.winId = state.summary.windowId;
      } else {
        options.tabId = state.summary.tabId;
      }
      await browser.conversations.detachAttachment(options);
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
