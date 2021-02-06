/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { ContactDetail } from "./contactDetail.jsx";
import { messageActions } from "./reducer-messages.js";
import { MessageHeaderOptions } from "./messageHeaderOptions.jsx";
import { MessageTags, SpecialMessageTags } from "./messageTags.jsx";
import { SvgIcon } from "./svgIcon.jsx";
import { browser } from "./es-modules/thunderbird-compat.js";

/**
 * Returns a localized list separator which is based on the length of the list.
 *
 * @param {Number} index
 * @param {Number} length
 * @returns {string}
 */
function _getSeparator(index, length) {
  if (index == 0) {
    return "";
  }
  if (index < length - 1) {
    return browser.i18n.getMessage("header.commaSeparator");
  }
  return browser.i18n.getMessage("header.andSeparator");
}

/**
 * Opens `popup` when the child element(s) are hovered over,
 * or they are focused. The children are surrounded by a <span>.
 * Any additional props are passed to the surrounding <span>.
 * An element with `id=popup-container` is assumed to exist somewhere
 * near the root of the DOM. The children elements are rendered,
 * absolutely positions, inside the popup-container.
 *
 * @param {*} { children, popup, ...rest }
 * @returnType {React.Node}
 */
function HoverFade({ children, popup, ...rest }) {
  const [isHovering, setIsHovering] = React.useState(false);
  const spanRef = React.useRef(null);
  const popupParentNode =
    document.querySelector("#popup-container") || spanRef.current;

  // Calculate where to render the popup
  const pos = (spanRef.current && spanRef.current.getBoundingClientRect()) || {
    left: 0,
    top: 0,
    bottom: 0,
  };

  return (
    <>
      <span
        ref={spanRef}
        className="fade-parent"
        {...rest}
        onMouseEnter={() => {
          setIsHovering(true);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
        }}
      >
        {children}
      </span>
      {popupParentNode &&
        ReactDOM.createPortal(
          <div
            className={`fade-popup ${isHovering ? "hover" : ""}`}
            style={{
              left: window.scrollX + pos.left,
              top: window.scrollY + pos.bottom,
            }}
          >
            {popup}
          </div>,
          popupParentNode
        )}
    </>
  );
}
HoverFade.propTypes = {
  children: PropTypes.node,
  popup: PropTypes.node,
};

/**
 * Display an email address wrapped in <...> braces.
 *
 * @param {*} { email }
 * @returnType {React.Node}
 */
function Email({ email }) {
  return `<${email.trim()}>`;
}
Email.propTypes = { email: PropTypes.string.isRequired };

export function DetailedContactLabel({ separator, contact, className }) {
  // These components conditionally render
  let extraLabel = null;
  let emailLabel = null;

  // In a detail view, there is a star at the start of the contact
  // info and a line break at the end.
  const star = contact.contactId && "\u2605 ";
  emailLabel = contact.email && (
    <span className="smallEmail">
      {" "}
      <Email email={contact.email} />
    </span>
  );
  if (contact.extra) {
    extraLabel = `(${contact.extra})`;
  }

  return (
    <HoverFade
      popup={
        <ContactDetail
          name={contact.name}
          email={contact.displayEmail}
          realEmail={contact.email}
          avatar={contact.avatar}
          contactId={contact.contactId}
        />
      }
      style={{ display: "inline-block" }}
    >
      <span className={className}>
        <span>{separator}</span>
        <span className="tooltipWrapper contact">
          <span className="contactName">
            {star}
            {contact.name.trim()}
            {extraLabel}
            {emailLabel}
          </span>
        </span>
      </span>
    </HoverFade>
  );
}
DetailedContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  separator: PropTypes.string,
};
export function ContactLabel({ separator, contact, className }) {
  // These components conditionally render
  let extraLabel = null;
  let emailLabel = null;

  emailLabel = contact.displayEmail && (
    <span className="smallEmail">
      {" "}
      <Email email={contact.displayEmail} />
    </span>
  );
  if (contact.extra) {
    extraLabel = `(${contact.extra})`;
  }

  return (
    <HoverFade
      popup={
        <ContactDetail
          name={contact.name}
          email={contact.displayEmail}
          realEmail={contact.email}
          avatar={contact.avatar}
          contactId={contact.contactId}
        />
      }
      style={{ display: "inline-block" }}
    >
      <span className={className}>
        <span>{separator}</span>
        <span className="tooltipWrapper contact">
          <span className="contactName">
            {contact.name.trim()}
            {extraLabel}
            {emailLabel}
          </span>
        </span>
      </span>
    </HoverFade>
  );
}
ContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  separator: PropTypes.string,
};

function Avatar({ url, initials, isDefault, style }) {
  if (isDefault) {
    return (
      <abbr className="contactInitials" style={style}>
        {initials}
      </abbr>
    );
  }
  return (
    <span
      className="contactAvatar"
      style={{ backgroundImage: `url('${url}')` }}
    >
      {"\u00a0"}
    </span>
  );
}
Avatar.propTypes = {
  url: PropTypes.string,
  initials: PropTypes.string,
  isDefault: PropTypes.bool,
  style: PropTypes.object,
};

export function MessageHeader({
  starred,
  expanded,
  from,
  msgUri,
  id,
  dispatch,
  bcc,
  cc,
  date,
  detailsShowing,
  fullDate,
  attachments,
  multipleRecipients,
  recipientsIncludeLists,
  inView,
  isDraft,
  shortFolderName,
  snippet,
  tags,
  to,
  specialTags,
}) {
  console.log("MHEAD", snippet);
  function onClickHeader() {
    dispatch(
      messageActions.msgExpand({
        expand: !expanded,
        msgUri,
      })
    );
    if (!expanded) {
      dispatch(
        messageActions.markAsRead({
          id,
        })
      );
    }
  }

  function onClickStar(event) {
    event.stopPropagation();
    event.preventDefault();
    dispatch(
      messageActions.setStarred({
        id,
        starred: !starred,
      })
    );
  }

  const allTo = [...to, ...cc, ...bcc];
  // TODO: Maybe insert this after contacts but before snippet:
  // <span class="bzTo"> {{str "message.at"}} {{bugzillaUrl}}</span>

  let extraContacts = null;
  if (expanded && !detailsShowing) {
    extraContacts = (
      <React.Fragment>
        {browser.i18n.getMessage("header.to")}{" "}
        {allTo.map((contact, index) => (
          <ContactLabel
            className="to"
            contact={contact}
            key={index}
            separator={_getSeparator(index, allTo.length)}
          />
        ))}
      </React.Fragment>
    );
  }
  if (!expanded) {
    extraContacts = <React.Fragment></React.Fragment>;
  }

  return (
    <div
      className={`messageHeader hbox ${expanded ? "expanded" : ""}`}
      onClick={onClickHeader}
    >
      <div className="shrink-box">
        <div
          className={`star ${starred ? "starred" : ""}`}
          onClick={onClickStar}
        >
          <SvgIcon hash="star" />
        </div>
        <Avatar
          url={from.avatar}
          style={from.colorStyle}
          initials={from.initials}
          isDefault={from.avatar.startsWith("chrome:")}
        />{" "}
        <ContactLabel className="author" contact={from} />
        {extraContacts}
        {!expanded && (
          <span className="snippet">
            <MessageTags
              onTagsChange={(tags) => {
                dispatch(
                  messageActions.setTags({
                    id,
                    tags,
                  })
                );
              }}
              expanded={false}
              tags={tags}
            />
            <SpecialMessageTags
              onTagClick={(event, tag) => {
                dispatch(
                  messageActions.tagClick({
                    event,
                    msgUri,
                    details: tag.details,
                  })
                );
              }}
              folderName={shortFolderName}
              inView={inView}
              specialTags={specialTags}
            />
            {snippet}
          </span>
        )}
      </div>
      <MessageHeaderOptions
        dispatch={dispatch}
        date={date}
        detailsShowing={detailsShowing}
        expanded={expanded}
        fullDate={fullDate}
        id={id}
        attachments={attachments}
        multipleRecipients={multipleRecipients}
        recipientsIncludeLists={recipientsIncludeLists}
        isDraft={isDraft}
      />
    </div>
  );
}

MessageHeader.propTypes = {
  bcc: PropTypes.array.isRequired,
  cc: PropTypes.array.isRequired,
  dispatch: PropTypes.func.isRequired,
  date: PropTypes.string.isRequired,
  detailsShowing: PropTypes.bool.isRequired,
  expanded: PropTypes.bool.isRequired,
  from: PropTypes.object.isRequired,
  fullDate: PropTypes.string.isRequired,
  id: PropTypes.number.isRequired,
  msgUri: PropTypes.string.isRequired,
  attachments: PropTypes.array.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  inView: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
  shortFolderName: PropTypes.string.isRequired,
  snippet: PropTypes.string.isRequired,
  starred: PropTypes.bool.isRequired,
  tags: PropTypes.array.isRequired,
  to: PropTypes.array.isRequired,
  specialTags: PropTypes.array,
};
