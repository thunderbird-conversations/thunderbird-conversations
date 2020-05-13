/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, SvgIcon, attachmentActions */
/* exported Attachments */

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

  preview() {
    this.props.dispatch(
      attachmentActions.previewAttachment({
        name: this.props.name,
        url: this.props.url,
        isPdf: this.props.isPdf,
        maybeViewable: this.props.maybeViewable,
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
        msgUri: this.props.msgUri,
        attachment: {
          contentType: this.props.contentType,
          isExternal: this.props.isExternal,
          name: this.props.name,
          size: this.props.size,
          url: this.props.url,
        },
      })
    );
  }

  openAttachment() {
    this.props.dispatch(
      attachmentActions.openAttachment({
        msgUri: this.props.msgUri,
        attachment: {
          contentType: this.props.contentType,
          isExternal: this.props.isExternal,
          name: this.props.name,
          size: this.props.size,
          url: this.props.url,
        },
      })
    );
  }

  detachAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        msgUri: this.props.msgUri,
        shouldSave: true,
        attachment: {
          contentType: this.props.contentType,
          isExternal: this.props.isExternal,
          name: this.props.name,
          size: this.props.size,
          url: this.props.url,
        },
      })
    );
  }

  deleteAttachment() {
    this.props.dispatch(
      attachmentActions.detachAttachment({
        msgUri: this.props.msgUri,
        shouldSave: false,
        attachment: {
          contentType: this.props.contentType,
          isExternal: this.props.isExternal,
          name: this.props.name,
          size: this.props.size,
          url: this.props.url,
        },
      })
    );
  }

  render() {
    const enablePreview = this.props.isPdf || this.props.maybeViewable;
    const imgTitle = enablePreview
      ? browser.i18n.getMessage("attachments.viewAttachment.tooltip")
      : "";
    // TODO: Drag n drop

    // Note: contextmenu is only supported in Gecko, though React will complain
    // about it.
    // Hoping to turn this into WebExtension based context menus at some
    // stage: https://github.com/protz/thunderbird-conversations/issues/1416
    /* eslint-disable react/no-unknown-property */
    return (
      <li
        className="clearfix hbox attachment"
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
          <img
            className={this.props.imgClass}
            src={this.props.thumb}
            title={imgTitle}
          />
        </div>
        <div className="attachmentInfo align">
          <span className="filename">{this.props.name}</span>
          <span className="filesize">{this.props.formattedSize}</span>
          <div className="attachActions">
            {this.props.isPdf && (
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
  imgClass: PropTypes.string.isRequired,
  isExternal: PropTypes.bool.isRequired,
  isPdf: PropTypes.bool.isRequired,
  maybeViewable: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
  thumb: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};

class Attachments extends React.PureComponent {
  constructor() {
    super();
    this.showGalleryView = this.showGalleryView.bind(this);
    this.downloadAll = this.downloadAll.bind(this);
  }

  showGalleryView() {
    this.props.dispatch(
      attachmentActions.showGalleryView({
        type: "SHOW_GALLERY_VIEW",
        msgUri: this.props.msgUri,
      })
    );
  }

  downloadAll() {
    this.props.dispatch(
      attachmentActions.downloadAll({
        msgUri: this.props.msgUri,
        attachmentDetails: this.props.attachments.map((attachment) => ({
          contentType: attachment.contentType,
          isExternal: attachment.isExternal,
          name: attachment.name,
          size: attachment.size,
          url: attachment.url,
        })),
      })
    );
  }

  render() {
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
          {this.props.gallery && (
            <a
              onClick={this.showGalleryView}
              className="icon-link view-all"
              title={browser.i18n.getMessage("attachments.gallery.tooltip")}
            >
              <SvgIcon hash={"photo_library"} />
            </a>
          )}
          {this.props.attachments.map((attachment) => (
            <Attachment
              anchor={attachment.anchor}
              dispatch={this.props.dispatch}
              key={attachment.anchor}
              contentType={attachment.contentType}
              isExternal={attachment.isExternal}
              isPdf={attachment.isPdf}
              formattedSize={attachment.formattedSize}
              imgClass={attachment.imgClass}
              msgUri={this.props.msgUri}
              name={attachment.name}
              size={attachment.size}
              thumb={attachment.thumb}
              maybeViewable={attachment.maybeViewable}
              url={attachment.url}
            />
          ))}
        </div>
      </ul>
    );
  }
}

Attachments.propTypes = {
  dispatch: PropTypes.func.isRequired,
  attachments: PropTypes.array.isRequired,
  attachmentsPlural: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  gallery: PropTypes.bool.isRequired,
};
