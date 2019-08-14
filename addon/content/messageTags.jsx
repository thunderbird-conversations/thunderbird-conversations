/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes, Attachments, MessageHeader, MessageFooter,
           MessageIFrame */
/* exported MessageTags */

class MessageTags extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  getIsLight(color) {
    const rgb = color.substr(1) || "FFFFFF";
    // This is just so we can figure out if the tag color is too light and we
    // need to have the text black or not.
    const [, r, g, b] = rgb.match(/(..)(..)(..)/).map(x => parseInt(x, 16) / 255);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return l > .8;
  }

  onClick() {
    // TODO: Actually remove the tag. See Message.tags setter.
    // let tags = this.tags.filter(x => x.key != tag.key);
    //     this.tags = tags;
  }

  render() {
    return (
      <ul className="tags regular-tags">
        { !!this.props.tags && this.props.tags.map((tag, i) => {
          return (
            <li className={"tag" +
                           (this.getIsLight(tag.color) ? " light-tag" : "")}
                key={i}
                style={{backgroundColor: tag.color}}>
              {tag.name}
              { this.props.expanded &&
                <span className="tag-x" onClick={this.onClick}> x</span>
              }
            </li>
          );
        })}
      </ul>
    );
  }
}

MessageTags.propTypes = {
  dispatch: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  tags: PropTypes.array.isRequired,
};

class SpecialMessageTags extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClickInFolder = this.onClickInFolder.bind(this);
  }

  onClickInFolder() {
    // TODO: Click on in-folder when expanded should open the folder.
    // mainWindow.gFolderTreeView.selectFolder(self._msgHdr.folder, true);
    // mainWindow.gFolderDisplay.selectMessage(self._msgHdr);
  }

  render() {
    // TODO: Get the signed/decrypted/dkim-signed tags working properly.
    // Maybe use plugins to feed the data into the message display, and allow
    // them to set the icons/text to display?
    return (
      <ul className="tags special-tags">
        <li className="keep-tag tag-signed"
            title={this.props.strings.get("messageSignedLong")}>
            <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
              <use xlinkHref="chrome://conversations/skin/material-icons.svg#edit"></use>
            </svg>
          {this.props.strings.get("messageSigned")}
        </li>
        <li className="keep-tag tag-decrypted"
            title={this.props.strings.get("messageDecryptedLong")}>
          <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
            <use xlinkHref="chrome://conversations/skin/material-icons.svg#vpn_key"></use>
          </svg>
          {this.props.strings.get("messageDecrypted")}
        </li>
        <li className="keep-tag tag-dkim-signed">
          <svg className="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
            <use xlinkHref="chrome://conversations/skin/material-icons.svg#edit"></use>
          </svg>
          {this.props.strings.get("messageDKIMSigned")}
        </li>
        { !!this.props.folderName && !this.props.inView &&
          <li className="keep-tag in-folder"
              onClick={this.onClickInFolder}
              title={this.props.strings.get("jumpToFolder")}>
            {this.props.strings.get("inFolder", [this.props.folderName])}
          </li>
        }
      </ul>
    );
  }
}

SpecialMessageTags.propTypes = {
  inView: PropTypes.bool.isRequired,
  strings: PropTypes.object.isRequired,
  folderName: PropTypes.string.isRequired,
};
