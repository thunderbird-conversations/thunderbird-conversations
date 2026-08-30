/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import ReactDOM from "react-dom";
import { messageActions } from "../../reducer/reducerMessages.mjs";
import { getContactPhoto } from "../../reducer/contacts.mjs";

const STAR = "\u2605 ";

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
 * @param {object} props
 * @param {object} [props.children]
 * @param {string} props.contactId
 * @param {object} props.dispatch
 * @param {number} props.msgId
 * @param {object} props.popup
 * @param {object} [props.style]
 */
function HoverFade({ children, dispatch, contactId, msgId, popup, style }) {
  const [isHovering, setIsHovering] = React.useState(false);
  const [shouldShowPopup, setShouldShowPopup] = React.useState(false);
  const spanRef = React.useRef(null);
  const popupParentNode =
    document.querySelector("#popup-container") || spanRef.current;

  React.useEffect(() => {
    let timeoutId = null;
    if (isHovering) {
      getContactPhoto(msgId, contactId, dispatch);
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

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "span",
      {
        ref: spanRef,
        className: "fade-parent",
        style,
        onMouseEnter: () => {
          setIsHovering(true);
        },
        onMouseLeave: () => {
          setIsHovering(false);
        },
      },
      children
    ),
    popupParentNode &&
      ReactDOM.createPortal(
        React.createElement(
          "div",
          {
            className: `fade-popup ${shouldShowPopup ? "hover" : ""}`,
            style: {
              left: pos.left - parentPos.left,
              top: pos.bottom - parentPos.top,
            },
          },
          popup
        ),
        popupParentNode
      )
  );
}

/**
 * Display an email address wrapped in <...> braces.
 *
 * @param {object} props
 * @param {string} props.email
 */
function Email({ email }) {
  return `<${email.trim()}>`;
}

/**
 * A detailed contact label.
 */
export class DetailedContactLabel extends HTMLElement {
  static observedAttributes = ["msgid", "contactdetails"];

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="../content/components/message/messageHeader.css?v=1" />
          <span class="contactWrapper">
            <contact-detail></contact-detail>
            <span class="contactName">
              &nbsp;
              <span class="smallEmail">
              </span>
            </span>
          </span>
          </template>
        `,
        "text/html"
      );
      this._template = document.importNode(doc.querySelector("template"), true);
    }
    return this._template.content.cloneNode(true);
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(DetailedContactLabel.fragment);
    let msgId = this.getAttribute("msgid");
    if (msgId) {
      this.updateMsgId(msgId);
    }
    let contactDetails = this.getAttribute("contactdetails");
    if (contactDetails) {
      this.updateContactDetails(contactDetails);
    }
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name == "msgid") {
      this.updateMsgId(newValue);
      return;
    }
    this.updateContactDetails(newValue);
  }

  /**
   * Updates the msgId across the elements that need it.
   *
   * @param {string} msgId
   */
  updateMsgId(msgId) {
    this.shadowRoot
      .querySelector("contact-detail")
      .setAttribute("msgId", msgId);
  }

  /**
   * Updates the contact details.
   *
   * @param {string} contactDetails
   */
  updateContactDetails(contactDetails) {
    if (!contactDetails) {
      return;
    }
    let details = JSON.parse(contactDetails);
    let smallEmail = this.shadowRoot.querySelector(".smallEmail");
    if (details.email) {
      smallEmail.textContent = Email({ email: details.email });
    } else {
      smallEmail.textContent = "";
    }

    let contactName = this.shadowRoot.querySelector(".contactName");
    let textNode = document.createTextNode(
      details.contactId ? `${STAR} ${details.name.trim()}` : details.name.trim()
    );
    contactName.replaceChild(textNode, contactName.firstChild);

    let contactDetail = this.shadowRoot.querySelector("contact-detail");
    contactDetail.setAttribute("name", details.name ?? "");
    contactDetail.setAttribute("realemail", details.email ?? "");
    contactDetail.setAttribute("avatar", details.avatar ?? "");
    contactDetail.setAttribute("contactid", details.contactId ?? "");
    if (details.readOnly) {
      contactDetail.setAttribute("contactisreadonly", "true");
    } else {
      contactDetail.removeAttribute("contactisreadonly");
    }
  }
}
customElements.define("detailed-contact-label", DetailedContactLabel);

/**
 * Displays a contact label.
 *
 * @param {object} props
 * @param {string} props.className
 * @param {object} props.dispatch
 * @param {object} props.contact
 * @param {number} props.msgId
 */
export function ContactLabel({ contact, className, dispatch, msgId }) {
  // This component conditionally renders.
  let emailLabel =
    contact.displayEmail &&
    React.createElement(
      "span",
      { className: "smallEmail" },
      " ",
      React.createElement(Email, { email: contact.displayEmail })
    );

  return React.createElement(
    HoverFade,
    {
      msgId,
      contactId: contact.contactId,
      dispatch,
      popup: React.createElement("contact-detail", {
        name: contact.name,
        email: contact.displayEmail,
        msgId,
        realEmail: contact.email,
        avatar: contact.avatar,
        contactId: contact.contactId,
        contactIsReadOnly: contact.readOnly,
      }),
    },
    React.createElement(
      "span",
      { className },
      React.createElement(
        "span",
        { className: "contactName" },
        contact.name.trim(),
        emailLabel
      )
    )
  );
}

/**
 * Renders and Avatar icon.
 *
 * @param {object} props
 * @param {string} [props.url]
 * @param {string} [props.initials]
 * @param {object} [props.style]
 */
function Avatar({ url, initials, style }) {
  if (!url) {
    return React.createElement(
      "abbr",
      { className: "contactInitials", style },
      initials
    );
  }
  return React.createElement(
    "span",
    {
      className: "contactAvatar",
      style: { backgroundImage: `url('${url}')` },
    },
    "\u00a0"
  );
}

/**
 * Handles display for the header of a message.
 *
 * @param {object} props
 * @param {object[]} props.bcc
 * @param {object[]} props.cc
 * @param {Function} props.dispatch
 * @param {string} props.date
 * @param {boolean} props.detailsShowing
 * @param {boolean} props.expanded
 * @param {object} [props.from]
 * @param {string} props.fullDate
 * @param {number} props.id
 * @param {boolean} props.inView
 * @param {object[]} props.attachments
 * @param {boolean} props.multipleRecipients
 * @param {boolean} props.recipientsIncludeLists
 * @param {boolean} props.isDraft
 * @param {string} [props.shortFolderName]
 * @param {string} props.snippet
 * @param {boolean} props.starred
 * @param {object[]} props.tags
 * @param {object[]} props.to
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
  inView,
  shortFolderName,
  snippet,
  tags,
  to,
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

    extraContacts = React.createElement(
      React.Fragment,
      null,
      browser.i18n.getMessage("header.to") + " ",
      new Intl.ListFormat(locale, { style: "long", type: "conjunction" })
        .formatToParts(allToMap.keys())
        .map((item, i) => {
          if (item.type === "literal") {
            return React.createElement(
              "span",
              { className: "to", key: i },
              item.value
            );
          }
          const contact = allToMap.get(item.value);
          return React.createElement(ContactLabel, {
            className: "to",
            contact,
            dispatch,
            key: item.value,
            msgId: id,
          });
        }),
      " "
    );
  }
  if (!expanded) {
    extraContacts = React.createElement(React.Fragment);
  }

  let starTitle = browser.i18n.getMessage(
    starred ? "message.removeStar.tooltip" : "message.addStar.tooltip"
  );

  return React.createElement(
    "div",
    {
      className: `messageHeader hbox ${expanded ? "expanded" : ""}`,
      onClick: onClickHeader,
    },
    React.createElement(
      "div",
      { className: "shrink-box" },
      React.createElement(
        "button",
        {
          className: `star ${starred ? "starred" : ""}`,
          title: starTitle,
          onClick: onClickStar,
        },
        React.createElement("svg-icon", { "aria-hidden": true, hash: "star" })
      ),
      !!from &&
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Avatar, {
            url: from.avatar,
            style: from.colorStyle,
            initials: from.initials,
          }),
          " ",
          React.createElement(ContactLabel, {
            className: "author",
            contact: from,
            dispatch,
            msgId: id,
          })
        ),
      extraContacts,
      !expanded &&
        React.createElement(
          "span",
          { className: "snippet" },
          React.createElement("ul", {
            is: "message-tags",
            tags: JSON.stringify(tags),
            msgId: id,
          }),
          React.createElement("ul", {
            is: "special-message-tags",
            msgid: id,
            foldername: inView ? "" : shortFolderName,
          }),
          snippet
        )
    ),
    React.createElement(
      "message-header-options",
      {
        dispatch,
        detailsshowing: detailsShowing,
        expanded,
        msgid: id,
        attachments,
        multipleRecipients,
        recipientsIncludeLists,
        isdraft: isDraft,
      },
      React.createElement("span", { title: fullDate, slot: "date" }, date)
    )
  );
}
