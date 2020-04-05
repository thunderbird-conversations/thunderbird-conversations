/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, SvgIcon */
/* exported ActionButton */

const ActionsToInfoMap = {
  draft: {
    actionType: "EDIT_DRAFT",
    title: "action.editDraft",
    icon: "edit",
  },
  editAsNew: {
    actionType: "EDIT_AS_NEW",
    title: "action.editNew",
    icon: "edit",
  },
  reply: {
    actionType: "MSG_REPLY",
    title: "action.reply",
    icon: "reply",
  },
  replyAll: {
    actionType: "MSG_REPLY_ALL",
    title: "action.replyAll",
    icon: "reply_all",
  },
  replyList: {
    actionType: "MSG_REPLY_LIST",
    title: "action.replyList",
    icon: "list",
  },
  forward: {
    actionType: "MSG_FORWARD",
    title: "action.forward",
    icon: "forward",
  },
  archive: {
    actionType: "MSG_ARCHIVE",
    title: "action.archive",
    icon: "archive",
  },
  delete: {
    actionType: "MSG_DELETE",
    title: "action.delete",
    icon: "delete",
  },
  classic: {
    actionType: "MSG_OPEN_CLASSIC",
    title: "action.viewClassic",
    icon: "open_in_new",
  },
  source: {
    actionType: "MSG_OPEN_SOURCE",
    title: "action.viewSource",
    icon: "code",
  },
};

class ActionButton extends React.PureComponent {
  constructor(props) {
    super(props);
    this.action = this.action.bind(this);
  }

  action(event) {
    this.props.callback(
      {
        type: ActionsToInfoMap[this.props.type].actionType,
        shiftKey: event && event.shiftKey,
      },
      event
    );
  }

  render() {
    const info = ActionsToInfoMap[this.props.type];
    const title = browser.i18n.getMessage(info.title);
    return (
      <button
        className={this.props.className || ""}
        title={title}
        onClick={this.action}
      >
        <SvgIcon hash={info.icon} /> {!!this.props.showString && title}
      </button>
    );
  }
}

ActionButton.propTypes = {
  callback: PropTypes.func.isRequired,
  className: PropTypes.string,
  showString: PropTypes.bool,
  type: PropTypes.string.isRequired,
};
