/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";
import { messageActions } from "../../reducer/reducerMessages.mjs";
import { summaryActions } from "../../reducer/reducerSummary.mjs";

const LINKS_REGEX = /((\w+):\/\/[^<>()'"\s]+|www(\.[-\w]+){2,})/;

/**
 * Handles inserting links into the subject of a message.
 */
class LinkifiedSubject extends HTMLElement {
  static observedAttributes = ["subject", "loading"];
  static dispatch;

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="conversation.css" />
          <div class="subject">
          </div>
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
    this.shadowRoot.appendChild(LinkifiedSubject.fragment);
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    let subjectElement = this.shadowRoot.querySelector(".subject");
    let subject = this.getAttribute("subject");

    if (this.getAttribute("loading") == "true") {
      subjectElement.textContent = browser.i18n.getMessage("message.loading");
    } else if (!subject) {
      subjectElement.textContent = browser.i18n.getMessage("message.noSubject");
    } else if (LINKS_REGEX.test(subject)) {
      let contents = document.createDocumentFragment();
      let text = subject;

      while (text && LINKS_REGEX.test(text)) {
        let matches = LINKS_REGEX.exec(text);
        let [pre, ...post] = text.split(matches[1]);
        let link = document.createElement("a");
        link.href = matches[1];
        link.title = matches[1];
        link.class = "link";
        link.addEventListener("click", this.handleClick.bind(this));
        link.textContent = matches[1];
        if (pre) {
          contents.append(pre);
        }
        contents.append(link);
        text = post.join(matches[1]);
      }
      if (text) {
        contents.append(text);
      }

      subjectElement.replaceChildren(contents);
    } else {
      subjectElement.textContent = subject;
    }
  }

  handleClick(event) {
    LinkifiedSubject.dispatch(
      summaryActions.openLink({ url: event.target.title })
    );
    event.preventDefault();
  }
}
customElements.define("linkified-subject", LinkifiedSubject);

/**
 * Handles inserting links into the subject of a message.
 */
class ConversationActionButtons extends HTMLElement {
  static observedAttributes = [
    "aresomemessagesunread",
    "aresomemessagescollapsed",
    "canjunk",
    "darkreaderenabled",
  ];
  static dispatch;

  static get fragment() {
    if (!this._template) {
      let parser = new DOMParser();
      let doc = parser.parseFromString(
        `
        <template>
          <link rel="stylesheet" href="conversation.css" />
          <button class="button-flat actions-button hidden dark-mode-toggle">
            <svg-icon aria-hidden="true" hash="invert_colors"></svg-icon>
          </button>
          <button class="button-flat actions-button open-in-new">
            <svg-icon aria-hidden="true" hash="open_in_new"></svg-icon>
          </button>
          <button class="button-flat actions-button toggle-unread">
            <svg-icon aria-hidden="true" hash="new"></svg-icon>
          </button>
          <button class="button-flat actions-button expand">
            <svg-icon aria-hidden="true" class="expand-more" hash="expand_more"></svg-icon>
            <svg-icon aria-hidden="true" class="expand-less" hash="expand_less"></svg-icon>
          </button>
          <button class="button-flat actions-button junk">
            <svg-icon aria-hidden="true" hash="whatshot"></svg-icon>
          </button>
          <button class="button-flat actions-button archive">
            <svg-icon aria-hidden="true" hash="archive"></svg-icon>
          </button>
          <button class="button-flat actions-button trash">
            <svg-icon aria-hidden="true" hash="delete"></svg-icon>
          </button>
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
    this.shadowRoot.appendChild(ConversationActionButtons.fragment);

    let prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let darkModeToggle = this.shadowRoot.querySelector(".dark-mode-toggle");

    darkModeToggle.title = browser.i18n.getMessage(
      "message.turnDarkModeOff.tooltip"
    );
    darkModeToggle.addEventListener("click", this.#toggleDarkMode.bind(this));

    if (prefersDarkQuery.matches) {
      darkModeToggle.classList.remove("hidden");
    }
    prefersDarkQuery.addEventListener(
      "change",
      this.#darkModeUpdated.bind(this)
    );

    let openInNew = this.shadowRoot.querySelector(".open-in-new");
    openInNew.title = browser.i18n.getMessage("message.detach.tooltip");
    openInNew.addEventListener("click", this.#detachTab.bind(this));

    let toggleUnread = this.shadowRoot.querySelector(".toggle-unread");
    toggleUnread.title = browser.i18n.getMessage("message.read.tooltip");
    toggleUnread.addEventListener("click", this.#toggleRead.bind(this));

    let expand = this.shadowRoot.querySelector(".expand");
    expand.title = browser.i18n.getMessage("message.expand.tooltip");
    expand.addEventListener("click", this.#expandCollapse.bind(this));

    let junk = this.shadowRoot.querySelector(".junk");
    junk.title = browser.i18n.getMessage("message.junk.tooltip");
    junk.addEventListener("click", this.#junk.bind(this));

    let archive = this.shadowRoot.querySelector(".archive");
    archive.title = browser.i18n.getMessage("message.archive.tooltip");
    archive.addEventListener("click", this.#archive.bind(this));

    let trash = this.shadowRoot.querySelector(".trash");
    trash.title = browser.i18n.getMessage("message.trash.tooltip");
    trash.addEventListener("click", this.#trash.bind(this));
  }

  /**
   * Handles an attribute change.
   *
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "aresomemessagesunread": {
        let toggleUnread = this.shadowRoot.querySelector(".toggle-unread");
        if (newValue === "true") {
          toggleUnread.classList.add("unread");
        } else {
          toggleUnread.classList.remove("unread");
        }
        break;
      }
      case "aresomemessagescollapsed": {
        let expand = this.shadowRoot.querySelector(".expand");
        if (newValue === "true") {
          expand.classList.remove("collapse");
        } else {
          expand.classList.add("collapse");
        }
        break;
      }
      case "canjunk": {
        let junk = this.shadowRoot.querySelector(".junk");
        if (newValue === "true") {
          junk.classList.remove("hidden");
        } else {
          junk.classList.add("hidden");
        }
        break;
      }
      case "darkreaderenabled": {
        let darkToggle = this.shadowRoot.querySelector(".dark-mode-toggle");
        darkToggle.title = browser.i18n.getMessage(
          newValue === "true"
            ? "message.turnDarkModeOff.tooltip"
            : "message.turnDarkModeOn.tooltip"
        );
        darkToggle
          .querySelector("svg-icon")
          .setAttribute(
            "hash",
            newValue === "true" ? "invert_colors" : "invert_colors_off"
          );
        break;
      }
    }
  }

  handleClick(event) {
    ConversationActionButtons.dispatch(
      summaryActions.openLink({ url: event.target.title })
    );
    event.preventDefault();
  }

  #darkModeUpdated(event) {
    let darkModeToggle = this.shadowRoot.querySelector(".dark-mode-toggle");
    if (event.matches) {
      darkModeToggle.classList.remove("hidden");
    } else {
      darkModeToggle.classList.add("hidden");
    }
  }

  #toggleDarkMode(event) {
    ConversationActionButtons.dispatch(
      summaryActions.toggleDarkReaderEnabled()
    );
  }

  /**
   * This function gathers various information, encodes it in a URL query
   * string, and then opens a regular chrome tab that contains our
   * conversation.
   *
   * @param {Event} event
   */
  #detachTab(event) {
    ConversationActionButtons.dispatch(messageActions.detachTab());
  }

  // Mark the current conversation as read/unread. The conversation driver
  //  takes care of setting the right class on us whenever the state
  //  changes...
  #toggleRead(event) {
    ConversationActionButtons.dispatch(
      messageActions.toggleConversationRead({
        read: this.getAttribute("aresomemessagesunread") === "true",
      })
    );
  }

  #expandCollapse(event) {
    ConversationActionButtons.dispatch(
      messageActions.toggleConversationExpanded({
        expand: this.getAttribute("aresomemessagescollapsed") === "true",
      })
    );
  }

  #junk(event) {
    // This callback is only activated when the conversation is not a
    //  conversation in a tab AND there's only one message in the conversation,
    //  i.e. the currently selected message
    ConversationActionButtons.dispatch(
      messageActions.markAsJunk({
        id: this.getAttribute("firstid"),
        isJunk: true,
      })
    );
  }

  #archive(event) {
    ConversationActionButtons.dispatch(messageActions.archiveConversation());
  }

  #trash(event) {
    ConversationActionButtons.dispatch(messageActions.deleteConversation());
  }
}
customElements.define("conv-actions-buttons", ConversationActionButtons);

/**
 * Handles display for the header of the conversation.
 */
class _ConversationHeader extends React.PureComponent {
  get areSomeMessagesCollapsed() {
    return !this.props.msgData?.some((msg) => msg.expanded);
  }

  get areSomeMessagesUnread() {
    return !!this.props.msgData?.some((msg) => !msg.read);
  }

  get canJunk() {
    // TODO: Disable if in just a new tab? (e.g. double-click)
    // as per old comment:
    // We can never junk a conversation in a new tab, because the junk
    // command only operates on selected messages, and we're not in a
    // 3pane context anymore.

    return (
      this.props.msgData &&
      this.props.msgData.length <= 1 &&
      this.props.msgData.some((msg) => !msg.isJunk)
    );
  }

  render() {
    document.title = this.props.subject;
    LinkifiedSubject.dispatch = this.props.dispatch;
    ConversationActionButtons.dispatch = this.props.dispatch;

    return React.createElement(
      "div",
      { className: "conversationHeaderWrapper" },
      React.createElement(
        "div",
        { className: "conversationHeader" },
        React.createElement("linkified-subject", {
          loading: this.props.loading ? "true" : "false",
          subject: this.props.subject,
        }),
        React.createElement("conv-actions-buttons", {
          className: "actions",
          aresomemessagesunread: this.areSomeMessagesUnread.toString(),
          aresomemessagescollapsed: this.areSomeMessagesCollapsed.toString(),
          canjunk: this.canJunk.toString(),
          darkreaderenabled: this.props.darkReaderEnabled.toString(),
          firstid: this.props.msgData?.[0]?.id,
        })
      )
    );
  }
}

_ConversationHeader.propTypes = {
  dispatch: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  darkReaderEnabled: PropTypes.bool.isRequired,
  subject: PropTypes.string.isRequired,
  msgData: PropTypes.array.isRequired,
};

export const ConversationHeader = ReactRedux.connect((state) => {
  return {
    loading: state.summary.loading,
    subject: state.summary.subject,
    darkReaderEnabled: state.summary.darkReaderEnabled,
    msgData: state.messages.msgData,
  };
})(_ConversationHeader);
