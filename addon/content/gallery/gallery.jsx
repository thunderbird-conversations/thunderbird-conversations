/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const { StringBundle } = ChromeUtils.import(
  "resource:///modules/StringBundle.js"
);
const { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/mimemsg.js"
);
const { msgUriToMsgHdr } = ChromeUtils.import(
  "chrome://conversations/content/modules/stdlib/msgHdrUtils.js"
);
let strings = new StringBundle(
  "chrome://conversations/locale/message.properties"
);

/* globals React, ReactDOM, PropTypes */

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
  size: PropTypes.number.isRequired,
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

    // Create the Gallery object.
    let msgHdr = msgUriToMsgHdr(uri);
    if (msgHdr && msgHdr.messageId) {
      this.load(msgHdr);
    } else {
      document.getElementsByClassName("gallery")[0].textContent = strings.get(
        "messageMovedOrDeletedGallery2"
      );
    }
  }

  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   */
  load(msgHdr) {
    MsgHdrToMimeMessage(
      msgHdr,
      this,
      (mimeHdr, aMimeMsg) => {
        let attachments = aMimeMsg.allAttachments;
        attachments = attachments.filter(
          x => x.contentType.indexOf("image/") === 0
        );
        document.title = strings
          .get("galleryTitle")
          .replace("#1", mimeHdr.mime2DecodedSubject);
        this.output(attachments);
      },
      true,
      {
        partsOnDemand: true,
        examineEncryptedParts: true,
      }
    );
  }

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the handlebars template and then appends the result to the root
   *  DOM node.
   */
  output(attachments) {
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    let i = 1;
    this.setState({
      images: attachments.map(attachment => {
        return {
          index: i++,
          name: attachment.name,
          size: messenger.formatFileSize(attachment.size),
          src: attachment.url,
        };
      }),
    });
  }

  render() {
    return this.state.images.map(image => (
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
