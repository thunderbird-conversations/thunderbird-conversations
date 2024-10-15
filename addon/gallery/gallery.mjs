/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOMClient from "react-dom/client";
import PropTypes from "prop-types";

const Photo = React.forwardRef(({ index, length, name, size, src }, ref) =>
  React.createElement(
    "div",
    { className: "photoWrap", ref },
    React.createElement("img", { src }),
    React.createElement(
      "div",
      { className: "informationline" },
      React.createElement("div", { className: "filename" }, name),
      React.createElement("div", { className: "size" }, size),
      React.createElement("div", { className: "count" }, index + " / " + length)
    )
  )
);
Photo.displayName = "Photo";
Photo.propTypes = {
  index: PropTypes.number.isRequired,
  length: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.string.isRequired,
  src: PropTypes.string,
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

    let attachments = await browser.messages.listAttachments(id);

    attachments = attachments.filter(
      (p) => p.contentType.indexOf("image/") == 0
    );

    await this.output(attachments, id, scrollToPartName);
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
    // Get the initial data first.
    for (const attachment of attachments) {
      attachment.size = await browser.messengerUtilities.formatFileSize(
        attachment.size
      );
    }
    this.setState({
      images: attachments.map((attachment, i) => {
        return {
          index: i + 1,
          name: attachment.name,
          partName: attachment.partName,
          size: attachment.size,
          src: null,
        };
      }),
      scrollToPartName: null,
    });
    for (const [i, attachment] of attachments.entries()) {
      let file = await browser.messages.getAttachmentFile(
        id,
        attachment.partName
      );
      let newState = {
        images: [...this.state.images],
        scrollToPartName: this.state.scrollToPartName,
      };
      newState.images[i] = {
        ...newState.images[i],
        src: URL.createObjectURL(file),
      };
      if (scrollToPartName == newState.images[i].partName) {
        newState.scrollToPartName = scrollToPartName;
      }
      this.setState(newState);
    }
  }

  render() {
    return this.state.images.map((image) =>
      React.createElement(Photo, {
        index: image.index,
        key: image.index,
        name: image.name,
        ref:
          this.state.scrollToPartName == image.partName ? this.scrollTo : null,

        size: image.size,
        src: image.src,
        className: "gallery",
        length: this.state.images.length,
      })
    );
  }
}

window.addEventListener(
  "load",
  () => {
    const domContainer = document.getElementById("gallery");
    let root = ReactDOMClient.createRoot(domContainer);
    root.render(React.createElement(MyComponent));
  },
  { once: true }
);
