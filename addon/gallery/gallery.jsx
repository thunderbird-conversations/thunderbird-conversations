/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";

class Photo extends React.Component {
  render() {
    return (
      <div className="photoWrap">
        <img src={this.props.src} />
        <div className="informationline">
          <div className="filename">{this.props.name}</div>
          <div className="size">{this.props.size}</div>
          <div className="count">
            {this.props.index + " / " + this.props.length}
          </div>
        </div>
      </div>
    );
  }
}

Photo.propTypes = {
  index: PropTypes.number.isRequired,
  length: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.string.isRequired,
  src: PropTypes.string.isRequired,
};

class MyComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      images: [],
    };
  }

  componentDidMount() {
    // Parse URL components
    let param = "?uri="; // only one param
    let url = document.location.href;
    let uri = url.substr(url.indexOf(param) + param.length, url.length);

    this.load(decodeURI(uri)).catch(console.error);
  }

  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   */
  async load(uri) {
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

    await this.output(messageParts, id);
  }

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the handlebars template and then appends the result to the root
   *  DOM node.
   */
  async output(attachments, id) {
    let i = 1;
    for (const attachment of attachments) {
      attachment.url = await browser.conversations.getAttachmentBody(
        id,
        attachment.partName
      );
      attachment.size = await browser.conversations.formatFileSize(
        attachment.size
      );
    }
    this.setState({
      images: attachments.map((attachment) => {
        return {
          index: i++,
          name: attachment.name,
          size: attachment.size,
          src:
            "data:" +
            attachment.contentType +
            ";base64," +
            btoa(attachment.url),
        };
      }),
    });
  }

  render() {
    return this.state.images.map((image) => (
      <Photo
        index={image.index}
        key={image.index}
        name={image.name}
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
