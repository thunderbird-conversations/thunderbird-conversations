/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { DetailedContactLabel } from "./messageHeader.mjs";

/**
 * Handles the contact list on the message information.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {object[]} options.contacts
 * @param {string} [options.className]
 * @param {number} options.msgId
 */
function ContactList({ label, contacts, className = "", msgId }) {
  if (contacts.length === 0) {
    return null;
  }
  return React.createElement(
    "div",
    { className },
    React.createElement("u", null, label),
    " ",
    contacts.map((contact, i) =>
      React.createElement(
        React.Fragment,
        { key: i },
        React.createElement(DetailedContactLabel, {
          className: "",
          contact,
          msgId,
        }),
        React.createElement("br")
      )
    )
  );
}

/**
 * Handles display of the extended details for a message - the header lines.
 *
 * @param {object} options
 * @param {object[]} options.bcc
 * @param {object[]} options.cc
 * @param {{key: string, value: string}[]} options.extraLines
 * @param {object} options.from
 * @param {number} options.id
 * @param {object[]} options.to
 */
export function MessageDetails({ bcc, cc, extraLines, from, id, to }) {
  return React.createElement(
    "div",
    null,
    !!from &&
      React.createElement(
        "div",
        { className: "detailsLine fromLine" },
        React.createElement(
          "u",
          null,
          browser.i18n.getMessage("message.fromHeader")
        ),
        " ",
        React.createElement(DetailedContactLabel, {
          className: "",
          contact: from,
          msgId: id,
        })
      ),
    React.createElement(ContactList, {
      className: "detailsLine toLine",
      label: browser.i18n.getMessage("message.toHeader"),
      contacts: to,
      msgId: id,
    }),
    React.createElement(ContactList, {
      className: "detailsLine ccLine",
      label: browser.i18n.getMessage("message.ccHeader"),
      contacts: cc,
      msgId: id,
    }),
    React.createElement(ContactList, {
      className: "detailsLine bccLine",
      label: browser.i18n.getMessage("compose.fieldBcc"),
      contacts: bcc,
      msgId: id,
    }),
    !!extraLines?.length &&
      extraLines.map((line, i) => {
        return React.createElement(
          "div",
          { className: "detailsLine", key: i },
          React.createElement("u", null, `${line.key}:`),
          ` ${line.value}`
        );
      })
  );
}
