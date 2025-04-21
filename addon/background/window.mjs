/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This class handles hooking into the Thunderbird message window to be able
 * to manage the message preview correctly.
 */
// eslint-disable-next-line no-shadow
export class Window {
  #tabListeners = new Map();

  constructor() {
    this.connectedPorts = new Set();
  }

  async init() {
    // Set up our monkey patches which aren't really listeners, but this
    // is a good way to manage them.

    for (let tab of await browser.tabs.query({ mailTab: true })) {
      this.#addTabListener(tab.id);
    }

    browser.tabs.onCreated.addListener((tab) => {
      if (tab.mailTab) {
        this.#addTabListener(tab.id);
      }
    });
    browser.tabs.onRemoved.addListener((tabId) => {
      let listeners = this.#tabListeners.get(tabId);
      if (!listeners) {
        return;
      }
      browser.convMsgWindow.onMonkeyPatch.removeListener(
        listeners.monkey,
        tabId
      );
      browser.convMsgWindow.onThreadPaneActivate.removeListener(
        listeners.doubleClick,
        tabId
      );
      this.#tabListeners.delete(tabId);
    });

    browser.runtime.onConnect.addListener((port) => {
      this._handlePort(port);
    });

    /**
     * @typedef {"normal"|"success"|"warning"|"error"} Severity
     */
    /**
     * @typedef {object} AddPillMessage
     * @property {"addPill"} type
     *  The type of the received message.
     * @property {number} msgId
     *   The id of the associated Message from the WebExtension APIs.
     * @property {Severity} [severity]
     *   The severity of the pill. Defaults to normal.
     * @property {string} [icon]
     *   The optional icon of the pill. Musst be an "moz-extension://" url.
     * @property {string} message
     *   The text of the pill.
     * @property {string[]} [tooltip]
     *   The optional tooltip of the pill.
     */
    browser.runtime.onConnectExternal.addListener(async (port) => {
      port.onMessage.addListener((/** @type {AddPillMessage} */ msg) => {
        if (msg.type != "addPill") {
          return;
        }
        const pillMessage = msg;

        if (
          pillMessage.icon &&
          !pillMessage.icon.startsWith("moz-extension://")
        ) {
          pillMessage.icon = undefined;
        }

        for (let connectedPort of this.connectedPorts) {
          connectedPort.postMessage({
            type: "addSpecialTag",
            id: pillMessage.msgId,
            classNames: pillMessage.severity ?? "normal",
            icon: pillMessage.icon ?? "material-icons.svg#edit",
            message: pillMessage.message,
            tooltip: pillMessage.tooltip ?? [],
          });
        }
        // The above supports WebExtension page, this supports the chrome based
        // stub.xhtml.
        browser.conversations.postMessageViaBrowserSim({
          type: "addSpecialTag",
          id: pillMessage.msgId,
          classNames: pillMessage.severity ?? "normal",
          icon: pillMessage.icon ?? "material-icons.svg#edit",
          message: pillMessage.message,
          tooltip: pillMessage.tooltip ?? [],
        });
      });
    });

    for (let tab of await browser.tabs.query({ mailTab: true })) {
      await browser.convMsgWindow.maybeReloadMultiMessage(tab.id);
    }
  }

  #addTabListener(tabId) {
    let listeners = {
      monkey: () => {},
      doubleClick: this.doubleClickHandler.bind(this),
    };

    browser.convMsgWindow.onMonkeyPatch.addListener(listeners.monkey, tabId);
    browser.convMsgWindow.onThreadPaneActivate.addListener(
      listeners.doubleClick,
      tabId
    );
    this.#tabListeners.set(tabId, listeners);
  }

  _handlePort(port) {
    this.connectedPorts.add(port);
    port.onDisconnect.addListener((disconnectPort) => {
      this.connectedPorts.delete(disconnectPort);
    });
  }

  async doubleClickHandler(tabId, msgHdrs) {
    for (const hdr of msgHdrs) {
      if (hdr.folder.type == "drafts" || hdr.folder.type == "templates") {
        return {};
      }
      const account = await browser.accounts.get(hdr.folder.accountId);
      if (account.type == "nntp" || account.type == "rss") {
        return {};
      }
    }
    const urls = [];
    for (const hdr of msgHdrs) {
      urls.push(await browser.conversations.getMessageUriForId(hdr.id));
    }

    let windowId = (await browser.tabs.get(tabId)).windowId;
    await this.openConversation(windowId, urls);
    return {
      cancel: true,
    };
  }

  async openConversation(windowId, urls) {
    switch (
      await browser.conversations.getCorePref("mail.openMessageBehavior")
    ) {
      case 0: // fall-through
      case 1: {
        browser.convMsgWindow.openNewWindow(
          "chrome://conversations/content/stubWrapper.xhtml",
          this.getQueryString(urls) + "&standalone=1"
        );
        break;
      }
      case 2: {
        // TODO: An experimental standalone page which is WebExtension only.
        // It mainly works but is missing capabilities to stream the message
        // into the remote browser for the WebExtension.
        // await browser.tabs.create({
        //   url: `/content/standalone.html${this.getQueryString(urls)}`,
        // });
        await browser.conversations.createTab({
          url: `chrome://conversations/content/stub.html${this.getQueryString(
            urls
          )}`,
          type: "contentTab",
        });
        break;
      }
    }
  }

  /**
   * Returns a string of parameters for us in URLs when opening stub windows.
   *
   * @param {string[]} urls
   *   An array of urls to be opened.
   * @returns {string}
   */
  getQueryString(urls) {
    return "?urls=" + encodeURIComponent(urls.join(","));
  }
}
