/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { attachmentActions } from "../../reducer/reducer-attachments.js";
import { SvgIcon } from "../svgIcon.jsx";
import { ActionButton } from "./messageActionButton.jsx";

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

const RE_MSGKEY = /number=(\d+)/;

function AttachmentMoreMenu({ detachCallback, deleteCallback }) {
  return (
    <div className="tooltip tooltip-menu menu">
      <div className="arrow"></div>
      <div className="arrow inside"></div>
      <ul>
        <li className="action-detach">
          <ActionButton
            callback={detachCallback}
            className="optionsButton"
            showString={true}
            type="detachAttachment"
          />
        </li>
        <li className="action-delete">
          <ActionButton
            callback={deleteCallback}
            className="optionsButton"
            showString={true}
            type="deleteAttachment"
          />
        </li>
      </ul>
    </div>
  );
}
AttachmentMoreMenu.propTypes = {
  detachCallback: PropTypes.func.isRequired,
  deleteCallback: PropTypes.func.isRequired,
};

/**
 * Handles display of an individual attachment.
 */
class Attachment extends React.PureComponent {
  constructor(props) {
    super(props);
    this.preview = this.preview.bind(this);
    // this.onDragStart = this.onDragStart.bind(this);
    this.downloadAttachment = this.downloadAttachment.bind(this);
    this.openAttachment = this.openAttachment.bind(this);
    this.deleteAttachment = this.deleteAttachment.bind(this);
    this.detachAttachment = this.detachAttachment.bind(this);
    this.displayMenu = this.displayMenu.bind(this);
    this.state = {
      displayMenu: false,
    };
  }

  isImage(contentType) {
    return contentType.startsWith("image/");
  }

  preview() {
    this.props.dispatch(
      attachmentActions.previewAttachment({
        name: this.props.name,
        id: this.props.id,
        partName: this.props.partName,
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

  downloadAttachment() {
    this.props.dispatch(
      attachmentActions.downloadAttachment({
        id: this.props.id,
        partName: this.props.partName,
      })
    );
  }

  openAttachment() {
    this.props.dispatch(
      attachmentActions.openAttachment({
        id: this.props.id,
        partName: this.props.partName,
      })
    );
  }

  detachAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        id: this.props.id,
        partName: this.props.partName,
        shouldSave: true,
      })
    );
  }

  deleteAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        id: this.props.id,
        partName: this.props.partName,
        shouldSave: false,
      })
    );
  }

  displayMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.clickListener) {
      this.clickListener = (event) => {
        this.clearMenu();
      };
      this.keyListener = (event) => {
        if (event.keyCode == KeyEvent.DOM_VK_ESCAPE) {
          this.clearMenu();
        }
      };
      this.onBlur = (event) => {
        this.clearMenu();
      };
      document.addEventListener("click", this.clickListener);
      document.addEventListener("keypress", this.keyListener);
      document.addEventListener("blur", this.onBlur);
    }

    this.setState((prevState) => ({ displayMenu: !prevState.displayMenu }));
  }

  clearMenu() {
    this.setState({ displayMenu: false });
    if (this.clickListener) {
      document.removeEventListener("click", this.clickListener);
      document.removeEventListener("keypress", this.keyListener);
      document.removeEventListener("blur", this.keyListener);
      this.clickListener = null;
      this.keyListener = null;
    }
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
    const isImage = this.isImage(this.props.contentType);
    const imgTitle = isImage
      ? browser.i18n.getMessage("attachments.viewAttachment.tooltip")
      : browser.i18n.getMessage("attachments.open.tooltip");

    let thumb;
    let imgClass;
    if (isImage) {
      // TODO: Can we load images separately and make them available later,
      // so that we're not relying on having the url here. This would
      // mean we can use browser.messages.listAttachments.
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
    // onDragStart={this.onDragStart}
    return (
      <li className="attachment">
        <div
          className="attachmentThumb"
          draggable="false"
          onClick={isImage ? this.preview : this.openAttachment}
        >
          <img className={imgClass} src={thumb} title={imgTitle} />
        </div>
        <div className="attachmentInfo align">
          <span className="filename">{this.props.name}</span>
          <span className="filesize">{this.props.formattedSize}</span>
          <div className="attachActions">
            {isImage && (
              <a
                className="icon-link preview-attachment"
                title={browser.i18n.getMessage("attachments.preview.tooltip")}
                onClick={this.preview}
              >
                <SvgIcon hash="visibility" />
              </a>
            )}
            <a
              className="icon-link download-attachment"
              title={browser.i18n.getMessage("attachments.download.tooltip")}
              onClick={this.downloadAttachment}
            >
              <SvgIcon hash="file_download" />
            </a>
            <a
              className="icon-link open-attachment"
              title={browser.i18n.getMessage("attachments.open.tooltip")}
              onClick={this.openAttachment}
            >
              <SvgIcon hash="search" />
            </a>
            <span className="attachmentsDropDown">
              <a
                className="icon-link more-attachment"
                title={browser.i18n.getMessage("message.moreMenu.tooltip")}
                onClick={this.displayMenu}
              >
                <SvgIcon hash="more_vert" />
              </a>
              {this.state.displayMenu && (
                <AttachmentMoreMenu
                  detachCallback={this.detachAttachment}
                  deleteCallback={this.deleteAttachment}
                />
              )}
            </span>
          </div>
        </div>
      </li>
    );
  }
}

Attachment.propTypes = {
  anchor: PropTypes.string.isRequired,
  dispatch: PropTypes.func.isRequired,
  contentType: PropTypes.string.isRequired,
  formattedSize: PropTypes.string.isRequired,
  messageKey: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
  partName: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  id: PropTypes.number.isRequired,
};

/**
 * Handles display of attachments within a message, including options that
 * apply to all attachments.
 */
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
            messageKey={this.props.messageKey}
            id={this.props.id}
            name={attachment.name}
            partName={attachment.partName}
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
  messageKey: PropTypes.number.isRequired,
  id: PropTypes.number.isRequired,
};
