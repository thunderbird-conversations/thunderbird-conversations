/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";
import { ContactDetail } from "../contactDetail.jsx";
import { messageActions } from "../../reducer/reducerMessages.js";
import { MessageHeaderOptions } from "./messageHeaderOptions.jsx";
import { MessageTags, SpecialMessageTags } from "./messageTags.jsx";
import { SvgIcon } from "../svgIcon.jsx";

/**
 * Normalize a contact into a string (used for i18n formatting).
 *
 * @param {object} contact
 * @returns {string}
 */
function contactToString(contact) {
  return `${contact.name || ""} <${
    contact.displayEmail || contact.email
  }>`.trim();
}

/**
 * Opens `popup` when the child element(s) are hovered over,
 * or they are focused. The children are surrounded by a <span>.
 * Any additional props are passed to the surrounding <span>.
 * An element with `id=popup-container` is assumed to exist somewhere
 * near the root of the DOM. The children elements are rendered,
 * absolutely positions, inside the popup-container.
 *
 * @param {object} root0
 * @param {object} root0.children
 * @param {object} root0.popup
 * @returns {React.Node}
 */
function HoverFade({ children, popup, ...rest }) {
  const [isHovering, setIsHovering] = React.useState(false);
  const [shouldShowPopup, setShouldShowPopup] = React.useState(false);
  const spanRef = React.useRef(null);
  const popupParentNode =
    document.querySelector("#popup-container") || spanRef.current;

  React.useEffect(() => {
    let timeoutId = null;
    if (isHovering) {
      // If we hover over the label, we delay showing the popup.
      timeoutId = window.setTimeout(() => {
        if (isHovering) {
          setShouldShowPopup(true);
        } else {
          setShouldShowPopup(false);
        }
      }, 400);
    } else {
      // If we're not hovering, we don't delay hiding the popup.
      setShouldShowPopup(false);
    }
    return () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isHovering, setShouldShowPopup]);

  // Calculate where to render the popup
  const pos = spanRef.current?.getBoundingClientRect() || {
    left: 0,
    top: 0,
    bottom: 0,
  };
  const parentPos = popupParentNode?.getBoundingClientRect() || {
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
            className={`fade-popup ${shouldShowPopup ? "hover" : ""}`}
            style={{
              left: pos.left - parentPos.left,
              top: pos.bottom - parentPos.top,
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
 * @param {object} root0
 * @param {string} root0.email
 * @returns {React.Node}
 */
function Email({ email }) {
  return `<${email.trim()}>`;
}
Email.propTypes = { email: PropTypes.string.isRequired };

export function DetailedContactLabel({ contact, className, msgId }) {
  // This component conditionally renders.
  // In a detail view, there is a star at the start of the contact
  // info and a line break at the end.
  const star = contact.contactId && "\u2605 ";
  let emailLabel = contact.email && (
    <span className="smallEmail">
      {" "}
      <Email email={contact.email} />
    </span>
  );

  return (
    <HoverFade
      popup={
        <ContactDetail
          name={contact.name}
          email={contact.displayEmail}
          msgId={msgId}
          realEmail={contact.email}
          avatar={contact.avatar}
          contactId={contact.contactId}
          contactIsReadOnly={contact.readOnly}
        />
      }
      style={{ display: "inline-block" }}
    >
      <span className={className}>
        <span className="contactName">
          {star}
          {contact.name.trim()}
          {emailLabel}
        </span>
      </span>
    </HoverFade>
  );
}
DetailedContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  msgId: PropTypes.number.isRequired,
};

export function ContactLabel({ contact, className, msgId }) {
  // This component conditionally renders.
  let emailLabel = contact.displayEmail && (
    <span className="smallEmail">
      {" "}
      <Email email={contact.displayEmail} />
    </span>
  );

  return (
    <HoverFade
      popup={
        <ContactDetail
          name={contact.name}
          email={contact.displayEmail}
          msgId={msgId}
          realEmail={contact.email}
          avatar={contact.avatar}
          contactId={contact.contactId}
          contactIsReadOnly={contact.readOnly}
        />
      }
    >
      <span className={className}>
        <span className="contactName">
          {contact.name.trim()}
          {emailLabel}
        </span>
      </span>
    </HoverFade>
  );
}
ContactLabel.propTypes = {
  className: PropTypes.string.isRequired,
  contact: PropTypes.object.isRequired,
  msgId: PropTypes.number.isRequired,
};

function Avatar({ url, initials, isDefault, style }) {
  if (!url) {
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

// eslint-disable-next-line jsdoc/require-param
/**
 * Handles display for the header of a message.
 */
export function MessageHeader({
  starred,
  expanded,
  from,
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
  isDraft,
  shortFolderName,
  snippet,
  tags,
  to,
  specialTags,
}) {
  function onClickHeader() {
    dispatch(
      messageActions.expandMsg({
        expand: !expanded,
        id,
      })
    );
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

  // TODO: Maybe insert this after contacts but before snippet:
  // <span class="bzTo"> {{str "message.at"}} {{bugzillaUrl}}</span>

  let extraContacts = null;
  if (expanded && !detailsShowing) {
    const allTo = [...to, ...cc, ...bcc];
    const allToMap = new Map(
      allTo.map((contact) => [contactToString(contact), contact])
    );
    const locale = browser.i18n.getUILanguage();

    extraContacts = (
      <React.Fragment>
        {browser.i18n.getMessage("header.to")}{" "}
        {new Intl.ListFormat(locale, { style: "long", type: "conjunction" })
          .formatToParts(allToMap.keys())
          .map((item, i) => {
            if (item.type === "literal") {
              return (
                <span className="to" key={i}>
                  {item.value}
                </span>
              );
            }
            const contact = allToMap.get(item.value);
            return (
              <ContactLabel
                className="to"
                contact={contact}
                key={item.value}
                msgId={id}
              />
            );
          })}{" "}
      </React.Fragment>
    );
  }
  if (!expanded) {
    extraContacts = <React.Fragment></React.Fragment>;
  }

  let starTitle = browser.i18n.getMessage(
    starred ? "message.removeStar.tooltip" : "message.addStar.tooltip"
  );

  return (
    <div
      className={`messageHeader hbox ${expanded ? "expanded" : ""}`}
      onClick={onClickHeader}
    >
      <div className="shrink-box">
        <button
          className={`star ${starred ? "starred" : ""}`}
          title={starTitle}
          onClick={onClickStar}
        >
          <SvgIcon ariaHidden={true} hash="star" />
        </button>
        {!!from && (
          <>
            <Avatar
              url={from.avatar}
              style={from.colorStyle}
              initials={from.initials}
            />{" "}
            <ContactLabel className="author" contact={from} msgId={id} />
          </>
        )}
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
                    id,
                    details: tag.details,
                  })
                );
              }}
              folderName={shortFolderName}
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
  from: PropTypes.object,
  fullDate: PropTypes.string.isRequired,
  id: PropTypes.number.isRequired,
  attachments: PropTypes.array.isRequired,
  multipleRecipients: PropTypes.bool.isRequired,
  recipientsIncludeLists: PropTypes.bool.isRequired,
  isDraft: PropTypes.bool.isRequired,
  shortFolderName: PropTypes.string,
  snippet: PropTypes.string.isRequired,
  starred: PropTypes.bool.isRequired,
  tags: PropTypes.array.isRequired,
  to: PropTypes.array.isRequired,
  specialTags: PropTypes.array,
};
