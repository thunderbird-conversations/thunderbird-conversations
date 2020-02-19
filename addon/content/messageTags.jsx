/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals React, PropTypes */
/* exported MessageTags */

class MessageTag extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  getIsLight(color) {
    const rgb = color.substr(1) || "FFFFFF";
    // This is just so we can figure out if the tag color is too light and we
    // need to have the text black or not.
    const [, r, g, b] = rgb
      .match(/(..)(..)(..)/)
      .map(x => parseInt(x, 16) / 255);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return l > 0.8;
  }

  onClick() {
    this.props.onClickX(this.props.id);
  }

  render() {
    return (
      <li
        className={
          "tag" + (this.getIsLight(this.props.color) ? " light-tag" : "")
        }
        style={{ backgroundColor: this.props.color }}
      >
        {this.props.name}
        {this.props.expanded && (
          <span className="tag-x" onClick={this.onClick}>
            {" "}
            x
          </span>
        )}
      </li>
    );
  }
}

MessageTag.propTypes = {
  onClickX: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
};

class MessageTags extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onRemoveTag = this.onRemoveTag.bind(this);
  }

  onRemoveTag(tagId) {
    const tags = this.props.tags.filter(tag => tag.id != tagId);
    this.props.dispatch({
      type: "MSG_SET_TAGS",
      msgUri: this.props.msgUri,
      tags,
    });
  }

  render() {
    return (
      <ul className="tags regular-tags">
        {!!this.props.tags &&
          this.props.tags.map((tag, i) => (
            <MessageTag
              color={tag.color}
              id={tag.id}
              key={i}
              expanded={this.props.expanded}
              name={tag.name}
              onClickX={this.onRemoveTag}
            />
          ))}
      </ul>
    );
  }
}

MessageTags.propTypes = {
  dispatch: PropTypes.func.isRequired,
  expanded: PropTypes.bool.isRequired,
  msgUri: PropTypes.string.isRequired,
  tags: PropTypes.array.isRequired,
};

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
    return (
      <li
        className={
          this.props.classNames +
          " special-tag" +
          (this.props.canClick ? " can-click" : "")
        }
        title={this.props.title || ""}
        onClick={this.props.canClick ? this.onClick : null}
      >
        <svg
          className="icon"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
        >
          <use xlinkHref={this.props.icon}></use>
        </svg>
        {this.props.name}
        {!!this.props.tooltip && this.props.tooltip.type == "dkim" && (
          <span>
            <div>{this.props.tooltip.strings[0]}</div>
            {!!this.props.tooltip.strings[1] &&
              !!this.props.tooltip.strings[1].length && <hr />}
            {!!this.props.tooltip.strings[1] &&
              !!this.props.tooltip.strings[1].length &&
              this.props.tooltip.strings[1].map((s, i) => {
                return <div key={i}>{s}</div>;
              })}
            <div></div>
          </span>
        )}
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
