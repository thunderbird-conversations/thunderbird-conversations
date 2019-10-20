/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, topMail3Pane, StringBundle */
/* exported AttachmentMenu */

class AttachmentMenu extends React.PureComponent {
  constructor(props) {
    super(props);
    this.strings = new StringBundle("chrome://conversations/locale/pages.properties");
    this.open = this.open.bind(this);
    this.save = this.save.bind(this);
    this.detach = this.detach.bind(this);
    this.delete = this.delete.bind(this);
  }

  /**
   * This function finds the right node that holds the attachment information
   * and returns its information.
   *
   * @returns {object} The attachment information.
   */
  get currentAttInfo() {
    let node = topMail3Pane(window).document.popupNode;
    while (!node.attInfo)
      node = node.parentNode;
    return node.attInfo;
  }

  open() {
    this.currentAttInfo.open();
  }

  save() {
    this.currentAttInfo.save();
  }

  detach() {
    this.currentAttInfo.detach(true);
  }

  delete() {
    this.currentAttInfo.detach(false);
  }

  render() {
    return (
      <menu id="attachmentMenu" type="context">
        <menuitem
          label={this.strings.get("stub.context.open")}
          onClick={this.open}>
        </menuitem>
        <menuitem
          label={this.strings.get("stub.context.save")}
          onClick={this.save}>
        </menuitem>
        <menuitem
          label={this.strings.get("stub.context.detach")}
          onClick={this.detach}>
        </menuitem>
        <menuitem
          label={this.strings.get("stub.context.delete")}
          onClick={this.delete}>
        </menuitem>
      </menu>
    );
  }
}
