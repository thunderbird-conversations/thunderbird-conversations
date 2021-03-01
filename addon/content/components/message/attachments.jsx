/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { attachmentActions } from "../../reducer/reducer-attachments.js";
import { SvgIcon } from "../svgIcon.jsx";

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

const PDF_MIME_TYPES = [
  "application/pdf",
  "application/x-pdf",
  "application/x-bzpdf",
  "application/x-gzpdf",
];

const RE_MSGKEY = /number=(\d+)/;

class Attachment extends React.PureComponent {
  constructor(props) {
    super(props);
    this.preview = this.preview.bind(this);
    this.onDragStart = this.onDragStart.bind(this);
    this.downloadAttachment = this.downloadAttachment.bind(this);
    this.openAttachment = this.openAttachment.bind(this);
    this.deleteAttachment = this.deleteAttachment.bind(this);
    this.detachAttachment = this.detachAttachment.bind(this);
  }

  isImage(contentType) {
    return contentType.startsWith("image/");
  }

  isViewable(contentType) {
    return this.isImage(contentType) || contentType.startsWith("text/");
  }

  isPdf(contentType) {
    return PDF_MIME_TYPES.includes(contentType);
  }

  preview() {
    // Keep similar capabilities as previous versions where the user
    // can click the attachment to open the pdf.
    if (this.isPdf(this.props.contentType) && this.props.hasBuiltInPdf) {
      this.openAttachment();
      return;
    }
    this.props.dispatch(
      attachmentActions.previewAttachment({
        name: this.props.name,
        url: this.props.url,
        isPdf: this.isPdf(this.props.contentType),
        maybeViewable: this.isViewable(this.props.contentType),
      })
    );
  }

  onDragStart(event) {
    let info;
    if (/(^file:|&filename=)/.test(this.props.url)) {
      info = this.props.url;
    } else {
      info =
        this.props.url +
        "&type=" +
        this.props.contentType +
        "&filename=" +
        encodeURIComponent(this.props.name);
    }
    event.dataTransfer.setData(
      "text/x-moz-url",
      `${info}\n${this.props.name}\n${this.props.size}`
    );
    event.dataTransfer.setData("text/x-moz-url-data", this.props.url);
    event.dataTransfer.setData("text/x-moz-url-desc", this.props.name);
    event.dataTransfer.setData(
      "application/x-moz-file-promise-url",
      this.props.url
    );
    event.dataTransfer.setData("application/x-moz-file-promise", null);
    event.stopPropagation();
  }

  downloadAttachment() {
    this.props.dispatch(
      attachmentActions.downloadAttachment({
        id: this.props.id,
        attachmentUrl: this.props.url,
      })
    );
  }

  openAttachment() {
    this.props.dispatch(
      attachmentActions.openAttachment({
        id: this.props.id,
        attachmentUrl: this.props.url,
      })
    );
  }

  detachAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        id: this.props.id,
        attachmentUrl: this.props.url,
        shouldSave: true,
      })
    );
  }

  deleteAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        id: this.props.id,
        attachmentUrl: this.props.url,
        shouldSave: false,
      })
    );
  }

  iconForMimeType(mimeType) {
    if (ICON_MAPPING.has(mimeType)) {
      return ICON_MAPPING.get(mimeType) + ".svg";
    }
    let split = mimeType.split("/");
    if (split.length && FALLBACK_ICON_MAPPING.has(split[0] + "/")) {
      return FALLBACK_ICON_MAPPING.get(split[0] + "/") + ".svg";
    }
    return "gtk-file.png";
  }

  render() {
    const isPdf = this.isPdf(this.props.contentType);
    const enablePreview = isPdf || this.isViewable(this.props.contentType);
    const imgTitle = enablePreview
      ? browser.i18n.getMessage("attachments.viewAttachment.tooltip")
      : "";

    let thumb;
    let imgClass;
    if (this.isImage(this.props.contentType)) {
      thumb = this.props.url.replace(
        RE_MSGKEY,
        "number=" + this.props.messageKey
      );
      imgClass = "resize-me";
    } else {
      thumb = "icons/" + this.iconForMimeType(this.props.contentType);
      imgClass = "mime-icon";
    }
    // TODO: Drag n drop

    // Note: contextmenu is only supported in Gecko, though React will complain
    // about it.
    // Hoping to turn this into WebExtension based context menus at some
    // stage: https://github.com/thunderbird-conversations/thunderbird-conversations/issues/1416
    /* eslint-disable react/no-unknown-property */
    return (
      <li
        className="attachment"
        contextmenu={`attachmentMenu-${this.props.anchor}`}
      >
        <div
          className={
            "attachmentThumb" + (enablePreview ? " view-attachment" : "")
          }
          draggable="true"
          onClick={this.preview}
          onDragStart={this.onDragStart}
        >
          <img className={imgClass} src={thumb} title={imgTitle} />
        </div>
        <div className="attachmentInfo align">
          <span className="filename">{this.props.name}</span>
          <span className="filesize">{this.props.formattedSize}</span>
          <div className="attachActions">
            {isPdf && !this.props.hasBuiltInPdf && (
              <a
                className="icon-link preview-attachment"
                title={browser.i18n.getMessage("attachments.preview.tooltip")}
                onClick={this.preview}
              >
                <SvgIcon hash={"visibility"} />
              </a>
            )}
            <a
              className="icon-link download-attachment"
              title={browser.i18n.getMessage("attachments.download.tooltip")}
              onClick={this.downloadAttachment}
            >
              <SvgIcon hash={"file_download"} />
            </a>
            <a
              className="icon-link open-attachment"
              title={browser.i18n.getMessage("attachments.open.tooltip")}
              onClick={this.openAttachment}
            >
              <SvgIcon hash={"search"} />
            </a>
          </div>
        </div>
        <menu id={`attachmentMenu-${this.props.anchor}`} type="context">
          <menuitem
            label={browser.i18n.getMessage("attachments.context.open")}
            onClick={this.openAttachment}
          ></menuitem>
          <menuitem
            label={browser.i18n.getMessage("attachments.context.save")}
            onClick={this.downloadAttachment}
          ></menuitem>
          <menuitem
            label={browser.i18n.getMessage("attachments.context.detach")}
            onClick={this.detachAttachment}
          ></menuitem>
          <menuitem
            label={browser.i18n.getMessage("attachments.context.delete")}
            onClick={this.deleteAttachment}
          ></menuitem>
        </menu>
      </li>
    );
    /* eslint-enable react/no-unknown-property */
  }
}

Attachment.propTypes = {
  anchor: PropTypes.string.isRequired,
  dispatch: PropTypes.func.isRequired,
  contentType: PropTypes.string.isRequired,
  formattedSize: PropTypes.string.isRequired,
  hasBuiltInPdf: PropTypes.bool.isRequired,
  messageKey: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
  url: PropTypes.string.isRequired,
  id: PropTypes.number.isRequired,
};

export class Attachments extends React.PureComponent {
  constructor() {
    super();
    this.showGalleryView = this.showGalleryView.bind(this);
    this.downloadAll = this.downloadAll.bind(this);
  }

  showGalleryView() {
    this.props.dispatch(
      attachmentActions.showGalleryView({
        id: this.props.id,
      })
    );
  }

  downloadAll() {
    this.props.dispatch(
      attachmentActions.downloadAll({
        id: this.props.id,
      })
    );
  }

  render() {
    const showGalleryLink = this.props.attachments.some((a) =>
      a.contentType.startsWith("image/")
    );
    return (
      <ul className="attachments">
        <div className="attachHeader">
          {this.props.attachmentsPlural}
          <a
            className="icon-link download-all"
            onClick={this.downloadAll}
            title={browser.i18n.getMessage("attachments.downloadAll.tooltip")}
          >
            <SvgIcon hash={"file_download"} />
          </a>
          {showGalleryLink && (
            <a
              onClick={this.showGalleryView}
              className="icon-link view-all"
              title={browser.i18n.getMessage("attachments.gallery.tooltip")}
            >
              <SvgIcon hash={"photo_library"} />
            </a>
          )}
        </div>
        {this.props.attachments.map((attachment) => (
          <Attachment
            anchor={attachment.anchor}
            dispatch={this.props.dispatch}
            key={attachment.anchor}
            contentType={attachment.contentType}
            formattedSize={attachment.formattedSize}
            hasBuiltInPdf={this.props.hasBuiltInPdf}
            messageKey={this.props.messageKey}
            id={this.props.id}
            name={attachment.name}
            size={attachment.size}
            url={attachment.url}
          />
        ))}
      </ul>
    );
  }
}

Attachments.propTypes = {
  dispatch: PropTypes.func.isRequired,
  attachments: PropTypes.array.isRequired,
  attachmentsPlural: PropTypes.string.isRequired,
  hasBuiltInPdf: PropTypes.bool.isRequired,
  messageKey: PropTypes.number.isRequired,
  id: PropTypes.number.isRequired,
};
