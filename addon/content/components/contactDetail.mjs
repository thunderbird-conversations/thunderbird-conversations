/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { summaryActions } from "../reducer/reducerSummary.mjs";

function _ContactDetail({
  name,
  email,
  realEmail,
  avatar,
  contactId,
  contactIsReadOnly,
  dispatch,
  msgId,
}) {
  function onGeneralClick(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  function addContact(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(
      summaryActions.addContact({
        name,
        email: realEmail,
      })
    );
  }

  function createFilter(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(
      summaryActions.createFilter({
        email: realEmail,
      })
    );
  }

  function copyEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(summaryActions.copyEmail({ email: realEmail }));
  }

  function editContact(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(summaryActions.editContact({ contactId }));
  }

  function sendEmail(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(
      summaryActions.sendEmail({
        msgId,
        name,
        email: realEmail,
      })
    );
  }

  function showInvolving(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(
      summaryActions.showMessagesInvolving({
        name,
        email: realEmail,
      })
    );
  }

  // If there is a card for the contact, provide the option to
  // edit the card. Otherwise, provide an add button.
  let contactEdit;
  if (contactId) {
    contactEdit = contactIsReadOnly
      ? React.createElement(
          "button",
          {
            className: "viewContact",
            title: browser.i18n.getMessage("contact.viewContactTooltip"),
            onClick: editContact,
          },
          React.createElement("svg-icon", { hash: "person" })
        )
      : React.createElement(
          "button",
          {
            className: "editContact",
            title: browser.i18n.getMessage("contact.editContactTooltip"),
            onClick: editContact,
          },
          React.createElement("svg-icon", { hash: "edit" })
        );
  } else {
    contactEdit = React.createElement(
      "button",
      {
        className: "addContact",
        title: browser.i18n.getMessage("contact.addContactTooltip"),
        onClick: addContact,
      },
      React.createElement("svg-icon", { hash: "add" })
    );
  }

  let avatarURI =
    avatar ?? "chrome://messenger/skin/addressbook/icons/contact-generic.svg";

  return React.createElement(
    "div",
    { className: "tooltip", onClick: onGeneralClick },
    React.createElement("div", { className: "arrow" }),
    React.createElement("div", { className: "arrow inside" }),
    React.createElement(
      "div",
      { className: "authorInfoContainer" },
      React.createElement(
        "div",
        { className: "authorInfo" },
        React.createElement("span", { className: "name", title: name }, name),
        React.createElement(
          "span",
          { className: "authorEmail" },
          React.createElement(
            "span",
            { className: "authorEmailAddress", title: realEmail },
            realEmail
          ),
          React.createElement(
            "button",
            {
              className: "copyEmail",
              title: browser.i18n.getMessage("contact.copyEmailTooltip"),
              onClick: copyEmail,
            },
            React.createElement("svg-icon", { hash: "content_copy" })
          )
        )
      ),
      React.createElement(
        "div",
        { className: "authorPicture" },
        React.createElement("img", { src: avatarURI })
      )
    ),
    React.createElement(
      "div",
      { className: "tipFooter" },
      React.createElement(
        "button",
        {
          className: "sendEmail",
          title: browser.i18n.getMessage("contact.sendEmailTooltip"),
          onClick: sendEmail,
        },
        React.createElement("svg-icon", { hash: "mail" })
      ),
      React.createElement(
        "button",
        {
          className: "showInvolving",
          title: browser.i18n.getMessage("contact.recentConversationsTooltip"),
          onClick: showInvolving,
        },
        React.createElement("svg-icon", { hash: "history" })
      ),
      contactEdit,
      React.createElement(
        "button",
        {
          className: "createFilter",
          onClick: createFilter,
        },
        browser.i18n.getMessage("contact.createFilterTooltip")
      )
    )
  );
}
_ContactDetail.propTypes = {
  avatar: PropTypes.string,
  contactId: PropTypes.string,
  contactIsReadOnly: PropTypes.bool,
  dispatch: PropTypes.func.isRequired,
  email: PropTypes.string.isRequired,
  msgId: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  realEmail: PropTypes.string.isRequired,
};

export const ContactDetail = ReactRedux.connect()(_ContactDetail);
