/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";

const Photo = React.forwardRef(({ index, length, name, size, src }, ref) => (
  <div className="photoWrap" ref={ref}>
    <img src={src} />
    <div className="informationline">
      <div className="filename">{name}</div>
      <div className="size">{size}</div>
      <div className="count">{index + " / " + length}</div>
    </div>
  </div>
));
Photo.displayName = "Photo";
Photo.propTypes = {
  index: PropTypes.number.isRequired,
  length: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.string.isRequired,
  src: PropTypes.string.isRequired,
};

/**
 * Handles display of the gallery views.
 */
class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      images: [],
      scrollToPartName: null,
    };
    this.scrollTo = React.createRef();
  }

  componentDidMount() {
    let params = new URLSearchParams(document.location.search);
    let uri = params.get("msgUri");
    let scrollToPartName = params.get("partName");
    this.load(uri, scrollToPartName).catch(console.error);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.scrollToPartName && !prevState.scrollToPartName) {
      setTimeout(
        () => this.scrollTo.current.scrollIntoView({ behavior: "smooth" }),
        100
      );
    }
  }

  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   *
   * @param {string} uri
   * @param {string} scrollToPartName
   */
  async load(uri, scrollToPartName) {
    const id = await browser.conversations.getMessageIdForUri(uri);
    if (!id) {
      // TODO: Render this in react.
      document.getElementById("gallery").textContent = browser.i18n.getMessage(
        "gallery.messageMovedOrDeleted"
      );
      return;
    }
    const header = await browser.messages.get(id);
    document.title = browser.i18n.getMessage("gallery.title", [header.subject]);

    let messageParts = await browser.messages.getFull(id);
    messageParts = messageParts.parts[0].parts;

    messageParts = messageParts.filter(
      (p) => p.contentType.indexOf("image/") == 0
    );

    await this.output(messageParts, id, scrollToPartName);
  }

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the handlebars template and then appends the result to the root
   *  DOM node.
   *
   * @param {object[]} attachments
   * @param {string} id
   * @param {string} scrollToPartName
   */
  async output(attachments, id, scrollToPartName) {
    let i = 1;
    for (const attachment of attachments) {
      if ("getAttachmentFile" in browser.messages) {
        let file = await browser.messages.getAttachmentFile(
          id,
          attachment.partName
        );
        attachment.url = URL.createObjectURL(file);
      } else {
        attachment.url = await browser.conversations.getAttachmentBody(
          id,
          attachment.partName
        );
        attachment.url =
          "data:" + attachment.contentType + ";base64," + btoa(attachment.url);
      }
      attachment.size = await browser.conversations.formatFileSize(
        attachment.size
      );
    }
    this.setState({
      images: attachments.map((attachment) => {
        return {
          index: i++,
          name: attachment.name,
          partName: attachment.partName,
          size: attachment.size,
          src: attachment.url,
        };
      }),
      scrollToPartName,
    });
  }

  render() {
    return this.state.images.map((image) => (
      <Photo
        index={image.index}
        key={image.index}
        name={image.name}
        ref={
          this.state.scrollToPartName == image.partName ? this.scrollTo : null
        }
        size={image.size}
        src={image.src}
        className="gallery"
        length={this.state.images.length}
      />
    ));
  }
}

window.addEventListener(
  "load",
  () => {
    const domContainer = document.getElementById("gallery");
    ReactDOM.render(React.createElement(MyComponent), domContainer);
  },
  { once: true }
);
