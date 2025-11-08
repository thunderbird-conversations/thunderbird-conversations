/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { attachmentActions } from "../../reducer/reducerAttachments.mjs";
import { ActionButton } from "./messageActionButton.mjs";

const ICON_MAPPING = new Map([
  ["application/msword", "x-office-document"],
  ["application/vnd.ms-excel", "x-office-spreadsheet"],
  ["application/vnd.ms-powerpoint", "x-office-presentation"],
  ["application/rtf", "x-office-document"],
  ["application/zip", "package-x-generic"],
  ["application/bzip2", "package-x-generic"],
  ["application/x-gzip", "package-x-generic"],
  ["application/x-tar", "package-x-generic"],
  ["application/x-compressed", "package-x-generic"],
  // "message/": "email",
  ["text/x-vcalendar", "x-office-calendar"],
  ["text/x-vcard", "x-office-address-book"],
  ["text/html", "text-html"],
  ["application/pdf", "application-pdf"],
  ["application/x-pdf", "application-pdf"],
  ["application/x-bzpdf", "application-pdf"],
  ["application/x-gzpdf", "application-pdf"],
]);

const FALLBACK_ICON_MAPPING = new Map([
  // Fallbacks, at the end.
  ["video/", "video-x-generic"],
  ["audio/", "audio-x-generic"],
  ["image/", "image-x-generic"],
  ["text/", "text-x-generic"],
]);

/**
 * The more menu for attachments
 *
 * @param {object} options
 * @param {() => void} options.detachCallback
 * @param {() => void} options.deleteCallback
 */
function AttachmentMoreMenu({ detachCallback, deleteCallback }) {
  return React.createElement(
    "div",
    { className: "tooltip tooltip-menu menu" },
    React.createElement("div", { className: "arrow" }),
    React.createElement("div", { className: "arrow inside" }),
    React.createElement(
      "ul",
      null,
      React.createElement(
        "li",
        { className: "action-detach" },
        React.createElement(ActionButton, {
          callback: detachCallback,
          className: "optionsButton",
          showString: true,
          type: "detachAttachment",
        })
      ),
      React.createElement(
        "li",
        { className: "action-delete" },
        React.createElement(ActionButton, {
          callback: deleteCallback,
          className: "optionsButton",
          showString: true,
          type: "deleteAttachment",
        })
      )
    )
  );
}

/**
 * Handles display of an individual attachment.
 *
 * @param {object} options
 * @param {string} options.anchor
 * @param {Function} options.dispatch
 * @param {string} options.contentType
 * @param {string} options.formattedSize
 * @param {string} options.name
 * @param {number} options.size
 * @param {string} options.partName
 * @param {number} options.id
 */
function Attachment({
  anchor,
  dispatch,
  contentType,
  formattedSize,
  name,
  size,
  partName,
  id,
}) {
  let [displayMenu, setDisplayMenu] = React.useState(false);

  function preview() {
    dispatch(
      attachmentActions.previewAttachment({
        name,
        id,
        partName,
      })
    );
  }

  // TODO: Fix drag n drop of attachments.
  // onDragStart(event) {
  //   let info;
  //   if (/(^file:|&filename=)/.test(this.props.url)) {
  //     info = this.props.url;
  //   } else {
  //     info =
  //       this.props.url +
  //       "&type=" +
  //       this.props.contentType +
  //       "&filename=" +
  //       encodeURIComponent(this.props.name);
  //   }
  //   event.dataTransfer.setData(
  //     "text/x-moz-url",
  //     `${info}\n${this.props.name}\n${this.props.size}`
  //   );
  //   event.dataTransfer.setData("text/x-moz-url-data", this.props.url);
  //   event.dataTransfer.setData("text/x-moz-url-desc", this.props.name);
  //   event.dataTransfer.setData(
  //     "application/x-moz-file-promise-url",
  //     this.props.url
  //   );
  //   event.dataTransfer.setData("application/x-moz-file-promise", null);
  //   event.stopPropagation();
  // }

  function downloadAttachment() {
    dispatch(
      attachmentActions.downloadAttachment({
        id,
        partName,
      })
    );
  }

  function openAttachment() {
    dispatch(
      attachmentActions.openAttachment({
        id,
        partName,
      })
    );
  }

  function detachAttachment() {
    dispatch(
      attachmentActions.detachAttachment({
        id,
        partName,
        shouldSave: true,
      })
    );
  }

  function deleteAttachment() {
    dispatch(
      attachmentActions.detachAttachment({
        id,
        partName,
        fileName: name,
        shouldSave: false,
      })
    );
  }

  React.useEffect(() => {
    function clickOrBlurListener(event) {
      clearMenu();
    }
    function keyListener(event) {
      if (event.key == "Escape") {
        clearMenu();
      }
    }
    if (displayMenu) {
      document.addEventListener("click", clickOrBlurListener);
      document.addEventListener("keypress", keyListener);
      document.addEventListener("blur", clickOrBlurListener);
    }
    return () => {
      document.removeEventListener("click", clickOrBlurListener);
      document.removeEventListener("keypress", keyListener);
      document.removeEventListener("blur", clickOrBlurListener);
    };
  }, [displayMenu]);

  function handleDisplayMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setDisplayMenu(!displayMenu);
  }

  function clearMenu() {
    setDisplayMenu(false);
  }

  function iconForMimeType(mimeType) {
    if (ICON_MAPPING.has(mimeType)) {
      return ICON_MAPPING.get(mimeType) + ".svg";
    }
    let split = mimeType.split("/");
    if (split.length && FALLBACK_ICON_MAPPING.has(split[0] + "/")) {
      return FALLBACK_ICON_MAPPING.get(split[0] + "/") + ".svg";
    }
    return "gtk-file.png";
  }

  let isDeleted = contentType == "text/x-moz-deleted";

  let isImage = contentType.startsWith("image/");
  let imgTitle = isImage
    ? browser.i18n.getMessage("attachments.viewAttachment.tooltip")
    : browser.i18n.getMessage("attachments.open.tooltip");

  let [thumb, setThumb] = React.useState(null);
  let [imgClass, setImgClass] = React.useState(null);
  React.useEffect(() => {
    if (isImage) {
      // TODO: Can we load images separately and make them available later,
      // so that we're not relying on having the url here. This would
      // mean we can use browser.messages.listAttachments.
      (async () => {
        let file = await browser.messages.getAttachmentFile(id, partName);
        setThumb(URL.createObjectURL(file));
        setImgClass("resize-me");
      })();
    } else {
      setThumb("icons/" + iconForMimeType(contentType));
      setImgClass("mime-icon");
    }
  }, [id, contentType, partName]);

  // TODO: Drag n drop
  // onDragStart={this.onDragStart}
  return React.createElement(
    "li",
    { className: "attachment" },
    isDeleted &&
      React.createElement(
        "div",
        { className: "attachmentThumb deleted", draggable: "false" },
        React.createElement("img", {
          className: imgClass,
          src: thumb,
          title: name,
        })
      ),
    !isDeleted &&
      React.createElement(
        "div",
        {
          className: "attachmentThumb",
          draggable: "false",
          onClick: isImage ? preview : openAttachment,
        },
        React.createElement("img", {
          className: imgClass,
          src: thumb,
          title: imgTitle,
        })
      ),
    React.createElement(
      "div",
      { className: "attachmentInfo align" },
      React.createElement("span", { className: "filename" }, name),
      React.createElement("span", { className: "filesize" }, formattedSize),
      !isDeleted &&
        React.createElement(
          "div",
          { className: "attachActions" },
          isImage &&
            React.createElement(
              "a",
              {
                className: "icon-link preview-attachment",
                title: browser.i18n.getMessage("attachments.preview.tooltip"),
                onClick: preview,
              },
              React.createElement("svg-icon", { hash: "visibility" })
            ),
          React.createElement(
            "a",
            {
              className: "icon-link download-attachment",
              title: browser.i18n.getMessage("attachments.download.tooltip"),
              onClick: downloadAttachment,
            },
            React.createElement("svg-icon", { hash: "file_download" })
          ),
          React.createElement(
            "a",
            {
              className: "icon-link open-attachment",
              title: browser.i18n.getMessage("attachments.open.tooltip"),
              onClick: openAttachment,
            },
            React.createElement("svg-icon", { hash: "search" })
          ),
          React.createElement(
            "span",
            { className: "attachmentsDropDown" },
            React.createElement(
              "a",
              {
                className: "icon-link more-attachment",
                title: browser.i18n.getMessage("attachments.moreMenu.tooltip"),
                onClick: handleDisplayMenu,
              },
              React.createElement("svg-icon", { hash: "more_vert" })
            ),
            displayMenu &&
              React.createElement(AttachmentMoreMenu, {
                detachCallback: detachAttachment,
                deleteCallback: deleteAttachment,
              })
          )
        )
    )
  );
}

/**
 * Handles display of attachments within a message, including options that
 * apply to all attachments.
 *
 * @param {object} options
 * @param {Function} options.dispatch
 * @param {object[]} options.attachments
 * @param {string} options.attachmentsPlural
 * @param {number} options.id
 */
export function Attachments({ dispatch, attachments, attachmentsPlural, id }) {
  function showGalleryView() {
    dispatch(attachmentActions.showGalleryView({ id }));
  }

  function downloadAll() {
    dispatch(
      attachmentActions.downloadAll({
        id,
        partNames: attachments.map((a) => a.partName),
      })
    );
  }

  const showGalleryLink = attachments.some((a) =>
    a.contentType.startsWith("image/")
  );
  return React.createElement(
    "ul",
    { className: "attachments" },
    React.createElement(
      "div",
      { className: "attachHeader" },
      attachmentsPlural,
      React.createElement(
        "a",
        {
          className: "icon-link download-all",
          onClick: downloadAll,
          title: browser.i18n.getMessage("attachments.downloadAll.tooltip"),
        },
        React.createElement("svg-icon", { hash: "file_download" })
      ),
      showGalleryLink &&
        React.createElement(
          "a",
          {
            onClick: showGalleryView,
            className: "icon-link view-all",
            title: browser.i18n.getMessage("attachments.gallery.tooltip"),
          },
          React.createElement("svg-icon", { hash: "photo_library" })
        )
    ),
    attachments.map((attachment) =>
      React.createElement(Attachment, {
        anchor: attachment.anchor,
        dispatch,
        key: attachment.anchor,
        contentType: attachment.contentType,
        formattedSize: attachment.formattedSize,
        id,
        name: attachment.name,
        partName: attachment.partName,
        size: attachment.size,
      })
    )
  );
}
