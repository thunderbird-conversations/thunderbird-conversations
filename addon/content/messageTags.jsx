/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes */
/* exported MessageTags */

/**
 * Determine if a background color is light enough to require dark text.
 *
 * @param {string} color
 * @returns {boolean}
 */
function isColorLight(color) {
  const rgb = color.substr(1) || "FFFFFF";
  const [, r, g, b] = rgb.match(/(..)(..)(..)/).map(x => parseInt(x, 16) / 255);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.8;
}

function MessageTag(props) {
  const { onClickX, expanded, name, color } = props;
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

function MessageTags(props) {
  const { expanded, tags = [], onTagsChange } = props;

  function removeTag(tagId) {
    const filtered = tags.filter(tag => tag.id !== tagId);
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
            removeTag(tag.id);
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

function Icon(props) {
  const { path } = props;
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <use xlinkHref={path}></use>
    </svg>
  );
}
Icon.propTypes = { path: PropTypes.string.isRequired };

function DkimTooltip(props) {
  const { strings } = props;
  const [primaryString, secondaryStrings = []] = strings;
  const primaryTooltip = <div>{primaryString}</div>;
  const secondaryTooltip = secondaryStrings.length ? (
    <React.Fragment>
      <hr />
      {secondaryStrings.map((s, i) => (
        <div key={i}>{s}</div>
      ))}
      <div />
    </React.Fragment>
  ) : null;

  return (
    <span>
      {primaryTooltip}
      {secondaryTooltip}
    </span>
  );
}
DkimTooltip.propTypes = { strings: PropTypes.array.isRequired };

class SpecialMessageTag extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick(event) {
    this.props.dispatch({
      type: "TAG_CLICK",
      event,
      msgUri: this.props.msgUri,
      detail: this.props.onClick,
    });
  }

  render() {
    const {
      icon,
      name,
      title = "",
      tooltip = {},
      canClick,
      onClick,
      classNames,
    } = this.props;

    return (
      <li
        className={classNames + " special-tag" + (canClick ? " can-click" : "")}
        title={title}
        onClick={canClick ? onClick : null}
      >
        <Icon path={icon} />
        {name}
        {tooltip.type === "dkim" && <DkimTooltip strings={tooltip.strings} />}
      </li>
    );
  }
}

SpecialMessageTag.propTypes = {
  canClick: PropTypes.bool.isRequired,
  classNames: PropTypes.string.isRequired,
  dispatch: PropTypes.func.isRequired,
  icon: PropTypes.string.isRequired,
  msgUri: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  onClick: PropTypes.object.isRequired,
  tooltip: PropTypes.object.isRequired,
};

class SpecialMessageTags extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClickInFolder = this.onClickInFolder.bind(this);
  }

  onClickInFolder() {
    if (!this.props.canClickFolder) {
      return;
    }

    this.props.dispatch({
      type: "SWITCH_TO_FOLDER",
      msgUri: this.props.msgUri,
    });
  }

  render() {
    return (
      <ul className="tags special-tags">
        {!!this.props.specialTags &&
          !!this.props.specialTags.length &&
          this.props.specialTags.map((tag, i) => {
            return (
              <SpecialMessageTag
                canClick={tag.canClick}
                classNames={tag.classNames}
                dispatch={this.props.dispatch}
                icon={tag.icon}
                key={i}
                msgUri={this.props.msgUri}
                name={tag.name}
                onClick={tag.onClick}
                title={tag.title}
                tooltip={tag.tooltip}
              />
            );
          })}
        {!!this.props.folderName && !this.props.inView && (
          <li
            className="in-folder"
            onClick={this.onClickInFolder}
            title={this.props.strings.get("jumpToFolder")}
          >
            {this.props.strings.get("inFolder", [this.props.folderName])}
          </li>
        )}
      </ul>
    );
  }
}

SpecialMessageTags.propTypes = {
  canClickFolder: PropTypes.bool.isRequired,
  dispatch: PropTypes.func.isRequired,
  folderName: PropTypes.string.isRequired,
  inView: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  specialTags: PropTypes.array.isRequired,
  strings: PropTypes.object.isRequired,
};
