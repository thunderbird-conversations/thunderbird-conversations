/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * This class handles hooking into the Thunderbird message window to be able
 * to manage the message preview correctly.
 */
export class Window {
  constructor() {
    this.connectedPorts = new Set();
  }

  async init() {
    // Set up our monkey patches which aren't really listeners, but this
    // is a good way to manage them.
    let monkeyPatchListener = () => {};
    browser.convMsgWindow.onMonkeyPatch.addListener(monkeyPatchListener);

    browser.convMsgWindow.onLayoutChange.addListener(async () => {
      // Let any stacks unwind and ensure the new layout applies.
      await new Promise((r) => setTimeout(r, 0));

      browser.convMsgWindow.onMonkeyPatch.removeListener(monkeyPatchListener);
      browser.convMsgWindow.onMonkeyPatch.addListener(monkeyPatchListener);

      // Now reload the multi message pane, if necessary, to ensure the stub
      // page continues to work. This may loose scroll position, but its the
      // best we can do.
      await browser.convMsgWindow.maybeReloadMultiMessage();
    });

    browser.convMsgWindow.onThreadPaneDoubleClick.addListener(
      async (windowId, msgHdrs) => {
        for (const hdr of msgHdrs) {
          const account = await browser.accounts.get(hdr.folder.accountId);
          if (account.type == "nntp" || account.type == "rss") {
            return {};
          }
        }
        const urls = [];
        for (const hdr of msgHdrs) {
          urls.push(await browser.conversations.getMessageUriForId(hdr.id));
        }
        await this.openConversation(windowId, urls);
        return {
          cancel: true,
        };
      }
    );

    browser.convMsgWindow.onThreadPaneMiddleClick.addListener(
      async (windowId, msgHdrs) => {
        for (const hdr of msgHdrs) {
          const account = await browser.accounts.get(hdr.folder.accountId);
          if (account.type == "nntp" || account.type == "rss") {
            return {};
          }
        }
        const urls = [];
        for (const hdr of msgHdrs) {
          urls.push(await browser.conversations.getMessageUriForId(hdr.id));
        }
        const url = this.makeConversationUrl(urls);
        await browser.conversations.createTab({
          url,
          type: "chromeTab",
        });
        return {
          cancel: true,
        };
      }
    );

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
      port.onMessage.addListener((msg) => {
        if (msg.type != "addPill") {
          return;
        }
        /** @type {AddPillMessage} */
        const pillMessage = msg;

        if (
          pillMessage.icon &&
          !pillMessage.icon.startsWith("moz-extension://")
        ) {
          pillMessage.icon = undefined;
        }

        for (let port of this.connectedPorts) {
          port.postMessage({
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

    await browser.convMsgWindow.maybeReloadMultiMessage();
  }

  _handlePort(port) {
    this.connectedPorts.add(port);
    port.onDisconnect.addListener((port) => {
      this.connectedPorts.delete(port);
    });
  }

  async openConversation(windowId, urls) {
    switch (
      await browser.conversations.getCorePref("mail.openMessageBehavior")
    ) {
      case 0: // fall-through
      case 1: {
        // Thunderbird 91
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
