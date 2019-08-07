/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, ReactRedux, StringBundle */
/* exported Attachments */

class Attachment extends React.PureComponent {
  constructor() {
    super();
    this.preview = this.preview.bind(this);
    this.downloadAttachment = this.downloadAttachment.bind(this);
    this.openAttachment = this.openAttachment.bind(this);
  }

  preview() {
    this.props.dispatch({
      type: "PREVIEW_ATTACHMENT",
      name: this.props.name,
      url: this.props.url,
      isPdf: this.props.isPdf,
      maybeViewable: this.props.maybeViewable,
    });
  }

  downloadAttachment() {
    this.props.dispatch({
      type: "DOWNLOAD_ATTACHMENT",
      msgUri: this.props.msgUri,
      url: this.props.url,
    });
  }

  openAttachment() {
    this.props.dispatch({
      type: "OPEN_ATTACHMENT",
      msgUri: this.props.msgUri,
      url: this.props.url,
    });
  }

  render() {
    const enablePreview = this.props.isPdf || this.props.maybeViewable;
    const imgTitle =  enablePreview ?
      this.props.strings.get("viewAttachment") : "";
    // TODO: Drag n drop
    // Due to "contextmenu". We probably should change this to use
    // the newer "onContextMenu".
    /* eslint-disable react/no-unknown-property */
    return (
      <li className="clearfix hbox attachment"
          contextmenu="attachmentMenu"
          draggable="true">
        <div className="attachmentThumb">
          <img className={this.props.imgClass + (enablePreview ? " view-attachment" : "")}
               src={this.props.thumb}
               onClick={this.preview}
               title={imgTitle} />
        </div>
        <div className="attachmentInfo align">
          <span className="filename">{this.props.name}</span>
          <span className="filesize">{this.props.formattedSize}</span>
          <div className="attachActions">
            { this.props.isPdf &&
              <a className="icon-link preview-attachment"
                 title={this.props.strings.get("preview")}
                 onClick={this.preview}>
                <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                  <use xlinkHref="chrome://conversations/skin/material-icons.svg#visibility"></use>
                </svg>
              </a>
            }
            <a className="icon-link download-attachment"
                title={this.props.strings.get("download2")}
                onClick={this.downloadAttachment}>
              <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#file_download"></use>
              </svg>
            </a>
            <a className="icon-link open-attachment"
               title={this.props.strings.get("open")}
               onClick={this.openAttachment}>
              <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#search"></use>
              </svg>
            </a>
          </div>
        </div>
      </li>
    );
    /* eslint-enable react/no-unknown-property */
  }
}

Attachment.propTypes = {
  dispatch: PropTypes.func.isRequired,
  formattedSize: PropTypes.string.isRequired,
  imgClass: PropTypes.string.isRequired,
  isPdf: PropTypes.bool.isRequired,
  maybeViewable: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  strings: PropTypes.object.isRequired,
  thumb: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};

class Attachments extends React.PureComponent {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/template.properties");
    this.showGalleryView = this.showGalleryView.bind(this);
    this.downloadAll = this.downloadAll.bind(this);
  }

  showGalleryView() {
    this.props.dispatch({
      type: "SHOW_GALLERY_VIEW",
      msgUri: this.props.msgUri,
    });
  }

  downloadAll() {
    this.props.dispatch({
      type: "DOWNLOAD_ALL",
      msgUri: this.props.msgUri,
    });
  }

  render() {
    return (
      <ul className="attachments">
        <div className="attachHeader">
          {this.props.attachmentsPlural}
          <a className="icon-link download-all"
             onClick={this.downloadAll}
             title={this.strings.get("downloadAll2")}>
            <svg className="icon" viewBox="0 0 24 24"
                 xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#file_download"></use>
            </svg>
          </a>
          { this.props.gallery &&
            <a onClick={this.showGalleryView}
               className="icon-link view-all"
               title={this.strings.get("galleryView")}>
              <svg className="icon" viewBox="0 0 24 24"
                   xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
                <use xlinkHref="chrome://conversations/skin/material-icons.svg#photo_library"></use>
              </svg>
            </a>
          }
          {
            this.props.attachments.map((attachment) =>
              <Attachment
                dispatch={this.props.dispatch}
                key={attachment.anchor}
                isPdf={attachment.isPdf}
                formattedSize={attachment.formattedSize}
                imgClass={attachment.imgClass}
                msgUri={this.props.msgUri}
                name={attachment.name}
                strings={this.strings}
                thumb={attachment.thumb}
                maybeViewable={attachment.maybeViewable}
                url={attachment.url}/>
            )
          }
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
