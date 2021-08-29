/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import PropTypes from "prop-types";
import { SvgIcon } from "../svgIcon.jsx";
import { browser } from "../../es-modules/thunderbird-compat.js";

/**
 * Determine if a background color is light enough to require dark text.
 *
 * @param {string} color
 * @returns {boolean}
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

  return (
    <li
      className={"tag" + (isLight ? " light-tag" : "")}
      style={{ backgroundColor: color }}
    >
      {name}
      {expanded && (
        <span className="tag-x" onClick={onClickX}>
          {" "}
          x
        </span>
      )}
    </li>
  );
}
MessageTag.propTypes = {
  onClickX: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  name: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
};

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

  return (
    <ul className="tags regular-tags">
      {tags.map((tag, i) => (
        <MessageTag
          color={tag.color}
          expanded={expanded}
          key={i}
          name={tag.name}
          onClickX={() => {
            removeTag(tag.key);
          }}
        />
      ))}
    </ul>
  );
}
MessageTags.propTypes = {
  expanded: PropTypes.bool.isRequired,
  tags: PropTypes.array.isRequired,
  onTagsChange: PropTypes.func.isRequired,
};

/**
 * A basic icon from e.g. a different extension.
 *
 * @param {object} root0
 * @param {string} [root0.fullPath]
 * @returns {React.ReactNode}
 */
export function SpecialMessageTagIcon({ fullPath }) {
  return <img className="icon special-tag-ext-icon" src={fullPath} />;
}
SpecialMessageTagIcon.propTypes = { fullPath: PropTypes.string };

/**
 * Handles display of the SpecialMessageTag tooltip.
 *
 * @param {object} root0
 * @param {string[]} root0.strings
 */
function SpecialMessageTagTooltip({ strings }) {
  const tooltip = strings.length ? (
    <React.Fragment>
      {strings.map((s, i) => (
        <div key={i}>{s}</div>
      ))}
      <div />
    </React.Fragment>
  ) : null;

  return <span>{tooltip}</span>;
}
SpecialMessageTagTooltip.propTypes = { strings: PropTypes.array.isRequired };

/**
 * A generic handler for display of message tags.
 *
 * @param {object} root0
 * @param {string} root0.classNames
 * @param {string} root0.icon
 * @param {string} root0.name
 * @param {string} root0.title
 * @param {string} root0.tooltip
 * @param {Function} root0.onClick
 */
export function SpecialMessageTag({
  classNames,
  icon,
  name,
  title = "",
  tooltip = {},
  onClick = null,
}) {
  return (
    <li
      className={classNames + " special-tag" + (onClick ? " can-click" : "")}
      title={title}
      onClick={onClick}
    >
      {icon.startsWith("moz-extension://") ? (
        <SpecialMessageTagIcon fullPath={icon} />
      ) : (
        <SvgIcon fullPath={icon} />
      )}
      {name}
      {tooltip.strings && !!tooltip.strings.length && (
        <SpecialMessageTagTooltip strings={tooltip.strings} />
      )}
    </li>
  );
}

SpecialMessageTag.propTypes = {
  classNames: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  title: PropTypes.string,
  onClick: PropTypes.func,
  tooltip: PropTypes.object,
};

/**
 * Handles display of all tags for a message.
 *
 * @param {object} root0
 * @param {Function} root0.onTagClick
 * @param {Function} root0.onFolderClick
 * @param {object[]} root0.specialTags
 * @param {string} root0.folderName
 */
export function SpecialMessageTags({
  onTagClick,
  onFolderClick = null,
  specialTags,
  folderName,
}) {
  let folderItem = null;
  if (folderName) {
    folderItem = (
      <li
        className="in-folder"
        onClick={onFolderClick}
        title={browser.i18n.getMessage("tags.jumpToFolder.tooltip")}
      >
        {browser.i18n.getMessage("tags.inFolder", [folderName])}
      </li>
    );
  }

  return (
    <ul className="tags special-tags">
      {specialTags &&
        specialTags.map((tag, i) => (
          <SpecialMessageTag
            classNames={tag.classNames}
            icon={tag.icon}
            key={i}
            name={tag.name}
            onClick={tag.details && ((event) => onTagClick(event, tag))}
            title={tag.title}
            tooltip={tag.tooltip}
          />
        ))}
      {folderItem}
    </ul>
  );
}

SpecialMessageTags.propTypes = {
  onTagClick: PropTypes.func.isRequired,
  onFolderClick: PropTypes.func,
  folderName: PropTypes.string,
  specialTags: PropTypes.array,
};
