/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { summaryActions } from "../reducer/reducer-summary.js";
import { SvgIcon } from "./svgIcon.jsx";
import { browser } from "../es-modules/thunderbird-compat.js";

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
    dispatch(summaryActions.editContact({ email: realEmail }));
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
    contactEdit = contactIsReadOnly ? (
      <button
        className="viewContact"
        title={browser.i18n.getMessage("contact.viewContactTooltip")}
        onClick={editContact}
      >
        <SvgIcon hash="person" />
      </button>
    ) : (
      <button
        className="editContact"
        title={browser.i18n.getMessage("contact.editContactTooltip")}
        onClick={editContact}
      >
        <SvgIcon hash="edit" />
      </button>
    );
  } else {
    contactEdit = (
      <button
        className="addContact"
        title={browser.i18n.getMessage("contact.addContactTooltip")}
        onClick={addContact}
      >
        <SvgIcon hash="add" />
      </button>
    );
  }

  let avatarURI =
    avatar ?? "chrome://messenger/skin/addressbook/icons/contact-generic.svg";

  return (
    <div className="tooltip" onClick={onGeneralClick}>
      <div className="arrow"></div>
      <div className="arrow inside"></div>
      <div className="authorInfoContainer">
        <div className="authorInfo">
          <span className="name" title={name}>
            {name}
          </span>
          <span className="authorEmail">
            <span className="authorEmailAddress" title={realEmail}>
              {realEmail}
            </span>
            <button
              className="copyEmail"
              title={browser.i18n.getMessage("contact.copyEmailTooltip")}
              onClick={copyEmail}
            >
              <SvgIcon hash="content_copy" />
            </button>
          </span>
        </div>
        <div className="authorPicture">
          <img src={avatarURI} />
        </div>
      </div>
      <div className="tipFooter">
        <button
          className="sendEmail"
          title={browser.i18n.getMessage("contact.sendEmailTooltip")}
          onClick={sendEmail}
        >
          <SvgIcon hash="mail" />
        </button>
        <button
          className="showInvolving"
          title={browser.i18n.getMessage("contact.recentConversationsTooltip")}
          onClick={showInvolving}
        >
          <SvgIcon hash="history" />
        </button>
        {contactEdit}
        <button className="createFilter" onClick={createFilter}>
          {browser.i18n.getMessage("contact.createFilterTooltip")}
        </button>
      </div>
    </div>
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
