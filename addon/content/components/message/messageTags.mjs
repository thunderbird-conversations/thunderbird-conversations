/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import { SvgIcon } from "../svgIcon.mjs";

/**
 * Determine if a background color is light enough to require dark text.
 *
 * @param {string} color
 */
function isColorLight(color) {
  const rgb = color.substr(1) || "FFFFFF";
  const [, r, g, b] = rgb
    .match(/(..)(..)(..)/)
    .map((x) => parseInt(x, 16) / 255);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.8;
}

/**
 * Handles display of a single message tag.
 *
 * @param {object} root0
 * @param {Function} root0.onClickX
 * @param {boolean} root0.expanded
 * @param {string} root0.name
 * @param {string} root0.color
 */
export function MessageTag({ onClickX, expanded, name, color }) {
  const isLight = isColorLight(color);

  return React.createElement(
    "li",
    {
      className: "tag" + (isLight ? " light-tag" : ""),
      style: { backgroundColor: color },
    },
    name,
    expanded &&
      React.createElement(
        "span",
        {
          role: "button",
          "aria-label": browser.i18n.getMessage("tags.removeButton"),
          className: "tag-x",
          tabIndex: "0",
          onClick: onClickX,
        },
        " x"
      )
  );
}

/**
 * Handles display of message tags within a message.
 *
 * @param {object} root0
 * @param {boolean} root0.expanded
 * @param {object[]} root0.tags
 * @param {Function} root0.onTagsChange
 */
export function MessageTags({ expanded, tags = [], onTagsChange }) {
  function removeTag(tagId) {
    const filtered = tags.filter((tag) => tag.key !== tagId);
    if (filtered.length !== tags.length) {
      // Only trigger a change if we actually removed a tag
      onTagsChange(filtered);
    }
  }

  return React.createElement(
    "ul",
    { className: "tags regular-tags" },
    tags.map((tag, i) =>
      React.createElement(MessageTag, {
        color: tag.color,
        expanded,
        key: i,
        name: tag.name,
        onClickX: () => {
          removeTag(tag.key);
        },
      })
    )
  );
}

/**
 * A basic icon from e.g. a different extension.
 *
 * @param {object} root0
 * @param {string} [root0.fullPath]
 */
export function SpecialMessageTagIcon({ fullPath }) {
  return React.createElement("img", {
    className: "icon special-tag-ext-icon",
    src: fullPath,
  });
}

/**
 * Handles display of the SpecialMessageTag tooltip.
 *
 * @param {object} root0
 * @param {string[]} root0.strings
 */
function SpecialMessageTagTooltip({ strings }) {
  const tooltip = strings.length
    ? React.createElement(
        React.Fragment,
        null,
        strings.map((s, i) => React.createElement("div", { key: i }, s)),
        React.createElement("div")
      )
    : null;

  return React.createElement("span", null, tooltip);
}

/**
 * Handles displaying of the tag information.
 *
 * @param {object} options
 * @param {object} options.info
 */
function DisplayInfo({ info }) {
  return React.createElement(
    "div",
    { className: "tooltip extraDetails" },
    React.createElement(
      "div",
      null,
      React.createElement("strong", null, info.signatureLabel),
      React.createElement("p", null, info.signatureExplanation),
      React.createElement(
        "p",
        null,
        React.createElement("strong", null, info.signatureKeyIdLabel)
      ),
      info.signerCert &&
        React.createElement(
          "p",
          null,
          React.createElement(
            "strong",
            null,
            browser.i18n.getMessage("openpgp.signedByLabel")
          ),
          ` ${info.signerCert.name}`,
          React.createElement("br"),
          React.createElement(
            "strong",
            null,
            browser.i18n.getMessage("openpgp.signedByEmailLabel")
          ),
          ` ${info.signerCert.email}`,
          React.createElement("br"),
          React.createElement(
            "strong",
            null,
            browser.i18n.getMessage("openpgp.certificateIssuedByLabel")
          ),
          ` ${info.signerCert.issuerName}`
        ),
      React.createElement("strong", null, info.encryptionLabel),
      React.createElement("p", null, info.encryptionExplanation),
      React.createElement(
        "p",
        null,
        React.createElement("strong", null, info.encryptionKeyIdLabel)
      ),
      React.createElement("p", info.otherKeysLabel),
      info.otherKeys &&
        info.otherKeys.map((key, i) =>
          React.createElement(
            "div",
            { key: i },
            key.name,
            React.createElement("br"),
            key.id
          )
        )
    )
  );
}

/**
 * A generic handler for display of message tags.
 *
 * @param {object} root0
 * @param {string} root0.classNames
 * @param {string} root0.icon
 * @param {object} root0.displayInfo
 * @param {string} root0.name
 * @param {string} root0.title
 * @param {object} root0.tooltip
 * @param {Function} root0.onClick
 */
export function SpecialMessageTag({
  classNames,
  icon,
  displayInfo,
  name,
  title = "",
  tooltip = {},
  onClick = null,
}) {
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);
  let closeExpandedDetails = React.useCallback(() => {
    setDetailsExpanded(false);
  }, []);
  let closeExpandedKeypress = React.useCallback((event) => {
    if (event.key == "Escape") {
      setDetailsExpanded(false);
    }
  }, []);

  React.useEffect(() => {
    document.addEventListener("blur", closeExpandedDetails);
    document.addEventListener("click", closeExpandedDetails);
    document.addEventListener("keypress", closeExpandedKeypress);

    return () => {
      document.removeEventListener("blur", closeExpandedDetails);
      document.removeEventListener("click", closeExpandedDetails);
      document.removeEventListener("keypress", closeExpandedKeypress);
    };
  }, []);

  function onInternalClick(event) {
    if (!displayInfo) {
      onClick(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (detailsExpanded) {
      setDetailsExpanded(false);
    } else {
      setDetailsExpanded(true);
    }
  }

  return React.createElement(
    "li",
    {
      className: classNames + " special-tag" + (onClick ? " can-click" : ""),
      title,
      onClick: onInternalClick,
    },
    detailsExpanded &&
      displayInfo &&
      React.createElement(DisplayInfo, { info: displayInfo }),
    icon.startsWith("moz-extension://")
      ? React.createElement(SpecialMessageTagIcon, { fullPath: icon })
      : React.createElement(SvgIcon, { fullPath: icon }),
    name,
    tooltip.strings &&
      !!tooltip.strings.length &&
      React.createElement(SpecialMessageTagTooltip, {
        strings: tooltip.strings,
      })
  );
}

/**
 * Handles display of all tags for a message.
 *
 * @param {object} props
 * @param {Function} props.onTagClick
 * @param {Function} [props.onFolderClick]
 * @param {object[]} [props.specialTags]
 * @param {string} [props.folderName]
 * @param {boolean} [props.inView]
 */
export function SpecialMessageTags({
  onTagClick,
  onFolderClick = null,
  specialTags,
  folderName,
  inView,
}) {
  let folderItem = null;
  if (!inView) {
    folderItem = React.createElement(
      "li",
      {
        className: "in-folder",
        onClick: onFolderClick,
        title: browser.i18n.getMessage("tags.jumpToFolder.tooltip"),
      },
      browser.i18n.getMessage("tags.inFolder", [folderName])
    );
  }

  return React.createElement(
    "ul",
    { className: "tags special-tags" },
    specialTags &&
      specialTags.map((tag, i) =>
        React.createElement(SpecialMessageTag, {
          classNames: tag.classNames,
          displayInfo: tag.details?.displayInfo,
          icon: tag.icon,
          key: i,
          name: tag.name,
          onClick: (event) => tag.details && onTagClick(event, tag),
          title: tag.title,
          tooltip: tag.tooltip,
        })
      ),
    folderItem
  );
}
