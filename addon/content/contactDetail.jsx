/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { summaryActions } from "./reducer-summary.js";
import { SvgIcon } from "./svgIcon.jsx";
import { browser } from "./es-modules/thunderbird-compat.js";

function _ContactDetail({
  name,
  email,
  realEmail,
  avatar,
  contactId,
  dispatch,
}) {
  const [expanded, setExpanded] = React.useState(false);

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
  const contactEdit = contactId ? (
    <button
      className="editContact"
      title={browser.i18n.getMessage("editCardAb")}
      onClick={editContact}
    >
      <SvgIcon hash="edit" />
    </button>
  ) : (
    <button
      className="addContact"
      title={browser.i18n.getMessage("addToAb")}
      onClick={addContact}
    >
      <SvgIcon hash="add" />
    </button>
  );

  const expandedInfo = (
    <div className="tipFooter hiddenFooter">
      <button className="createFilter" onClick={createFilter}>
        {"createFilter"}
      </button>
      {contactEdit}
    </div>
  );

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
              title={browser.i18n.getMessage("copyEmail")}
              onClick={copyEmail}
            >
              <SvgIcon hash="content_copy" />
            </button>
          </span>
        </div>
        <div className="authorPicture">
          <img src={avatar} />
        </div>
      </div>
      {expanded && expandedInfo}
      <div className="tipFooter">
        <button
          className="sendEmail"
          title={browser.i18n.getMessage("sendEmail")}
          onClick={sendEmail}
        >
          <SvgIcon hash="mail" />
        </button>
        <button
          className="showInvolving"
          title={browser.i18n.getMessage("recentConversations")}
          onClick={showInvolving}
        >
          <SvgIcon hash="history" />
        </button>
        {!expanded && (
          <button
            className="showInvolving"
            title={browser.i18n.getMessage("more")}
            onClick={() => {
              setExpanded(true);
            }}
          >
            <SvgIcon hash="expand_more" />
          </button>
        )}
      </div>
    </div>
  );
}
_ContactDetail.propTypes = {
  dispatch: PropTypes.func.isRequired,
  name: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  realEmail: PropTypes.string.isRequired,
  avatar: PropTypes.string.isRequired,
  contactId: PropTypes.string,
};

export const ContactDetail = ReactRedux.connect()(_ContactDetail);
