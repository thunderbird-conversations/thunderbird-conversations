/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { SvgIcon } from "../svgIcon.jsx";

const ActionsToInfoMap = {
  draft: {
    title: "action.editDraft",
    icon: "edit",
  },
  editAsNew: {
    title: "action.editNew",
    icon: "edit",
  },
  reply: {
    title: "action.reply",
    icon: "reply",
  },
  replyAll: {
    title: "action.replyAll",
    icon: "reply_all",
  },
  replyList: {
    title: "action.replyList",
    icon: "list",
  },
  forward: {
    title: "action.forward",
    icon: "forward",
  },
  archive: {
    title: "action.archive",
    icon: "archive",
  },
  delete: {
    title: "action.delete",
    icon: "delete",
  },
  classic: {
    title: "action.viewClassic",
    icon: "open_in_new",
  },
  source: {
    title: "action.viewSource",
    icon: "code",
  },
  deleteAttachment: {
    title: "attachments.context.delete",
    icon: "delete_forever",
  },
  detachAttachment: {
    title: "attachments.context.detach",
    icon: "save_alt",
  },
};

export function ActionButton({ type, callback, className, showString }) {
  const info = ActionsToInfoMap[type];
  const title = browser.i18n.getMessage(info.title);

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
