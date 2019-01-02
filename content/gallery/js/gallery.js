/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

ChromeUtils.import("resource:///modules/StringBundle.js"); // for StringBundle
const {MsgHdrToMimeMessage} = ChromeUtils.import("resource:///modules/gloda/mimemsg.js", {});
const {msgUriToMsgHdr} = ChromeUtils.import("resource://conversations/modules/stdlib/msgHdrUtils.js", {});
let strings = new StringBundle("chrome://conversations/locale/message.properties");

/* globals React, ReactDOM */

class Photo extends React.Component {
  render() {
    return React.createElement(
      "div", {
        className: "photoWrap",
      }, [
        React.createElement("img", {
          key: "image",
          src: this.props.src,
        }),
        React.createElement("div", {
          key: "informationline",
          className: "informationline",
        }, [
          React.createElement("div", {
            key: "filename",
            className: "filename",
          }, [
            this.props.name,
          ]),
          React.createElement("div", {
            key: "size",
            className: "size",
          }, [
            this.props.size,
          ]),
          React.createElement("div", {
            key: "count",
            className: "count",
          }, [
            this.props.index + " / " + this.props.length,
          ]),
        ]),
      ]
    );
  }
}

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
      document.getElementsByClassName("gallery")[0].textContent =
        strings.get("messageMovedOrDeletedGallery2");
    }
  }

  /**
   * This function takes care of obtaining a full representation of the message,
   *  and then taking all its attachments, to just keep track of the image ones.
   */
  load(msgHdr) {
    MsgHdrToMimeMessage(msgHdr, this, (mimeHdr, aMimeMsg) => {
      let attachments = aMimeMsg.allAttachments;
      attachments =
        attachments.filter(x => x.contentType.indexOf("image/") === 0);
      document.title =
        strings.get("galleryTitle").replace("#1", mimeHdr.mime2DecodedSubject);
      this.output(attachments);
    }, true, {
      partsOnDemand: true,
      examineEncryptedParts: true,
    });
  }

  /**
   * This function is called once the message has been streamed and the relevant
   *  data has been extracted from it.
   * It runs the handlebars template and then appends the result to the root
   *  DOM node.
   */
  output(attachments) {
    let messenger = Cc["@mozilla.org/messenger;1"]
                    .createInstance(Ci.nsIMessenger);
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
    return this.state.images.map(image => React.createElement(
      Photo, {
        ...image,
        key: image.index,
        className: "gallery",
        length: this.state.images.length,
      }
    ));
  }
}

window.addEventListener("load", () => {
  const domContainer = document.getElementById("gallery");
  ReactDOM.render(React.createElement(MyComponent), domContainer);
}, {once: true});
