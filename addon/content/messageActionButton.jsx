/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals PropTypes, React, StringBundle, SvgIcon, messageActions */
/* exported ActionButton */

const ActionsToInfoMap = {
  draft: {
    title: "editDraft2",
    icon: "edit",
  },
  editAsNew: {
    title: "editNew",
    icon: "edit",
  },
  reply: {
    title: "reply",
    icon: "reply",
  },
  replyAll: {
    title: "replyAll",
    icon: "reply_all",
  },
  replyList: {
    title: "replyList",
    icon: "list",
  },
  forward: {
    title: "forward",
    icon: "forward",
  },
  archive: {
    title: "archive",
    icon: "archive",
  },
  delete: {
    title: "delete",
    icon: "delete",
  },
  classic: {
    title: "viewClassic",
    icon: "open_in_new",
  },
  source: {
    title: "viewSource",
    icon: "code",
  },
};

function ActionButton({ type, callback, className, showString }) {
  const strings = new StringBundle(
    "chrome://conversations/locale/template.properties"
  );
  const info = ActionsToInfoMap[type];
  const title = strings.get(info.title);

  function action(event) {
    callback(
      {
        type,
        shiftKey: event && event.shiftKey,
      },
      event
    );
  }

  return (
    <button className={className || ""} title={title} onClick={action}>
      <SvgIcon hash={info.icon} /> {!!showString && title}
    </button>
  );
}
ActionButton.propTypes = {
  callback: PropTypes.func.isRequired,
  className: PropTypes.string,
  showString: PropTypes.bool,
  type: PropTypes.string.isRequired,
};
