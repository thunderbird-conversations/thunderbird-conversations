/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// For these APIs, we don't currently need the events API. Use the
// proxy set-up so that we can gain the benefit of the field validation
// that going through the APIs provides (namely setting unused fields
// to null) as this saves us being explicit about unused fields.
const SUPPORTED_APIS_NO_EVENTS = [
  "accounts",
  "addressBooks",
  "compose",
  "contacts",
  "convCompose",
  "folders",
  "identities",
  "mailTabs",
  // If "messages" is moved to SUPPORTED_BASE_APIS, then the various interfaces
  // MUST be tested very carefully. Last time this was tried, it would end up
  // clearing the starred flag when marking a message as read.
  "messages",
  "messengerUtilities",
  "tabs",
  "windows",
  // This is a temporary workaround so that we can "message" the background script.
  "_background",
];

const SUPPORTED_BASE_APIS = [
  ...SUPPORTED_APIS_NO_EVENTS,
  "convCalendar",
  "convContacts",
  "convGloda",
  "convMsgWindow",
  "convOpenPgp",
  "conversations",
  "i18n",
  "messageDisplay",
  "runtime",
  "storage",
];

/**
 * This class manages a WebExtension browser-like object that is used
 * to make WebExtension APIs available to the privileged parts of the add-on.
 *
 * This is a workaround whilst we still have stub.html being loaded in the
 * privileged scope.
 */
class _BrowserSim {
  #asyncBrowser = null;
  #browserListener = null;
  #context = null;
  #connectionListeners = null;
  #waitingForContext = null;
  #contextReceived = null;

  constructor() {
    this.#connectionListeners = new Set();

    this.#waitingForContext = new Promise(
      (resolve) => (this.#contextReceived = resolve)
    );
  }

  setBrowserListener(listener, context) {
    if (!listener) {
      this.#asyncBrowser = null;
      this.#browserListener = null;
      this.#context = null;
      this.#waitingForContext = new Promise(
        (resolve) => (this.#contextReceived = resolve)
      );
      return;
    }
    this.#browserListener = listener;
    this.#context = context;
    this.#contextReceived();
    this.#contextReceived = null;
  }

  // Async version of getBrowser that we can use in stub.html and other places
  // we can do async directly rather than going back across the webextension
  // APIs.
  // Note: this allows use of the event APIs.
  // Important note: Only the messages API has schema validation performed on it
  // due to the override below. Any other API that has optional parameters may
  // need those parameters setting to null.
  async getBrowserAsync() {
    if (this.#asyncBrowser) {
      return this.#asyncBrowser;
    }
    await this.#waitingForContext;
    let { extension } = this.#context;

    const browser = {};
    // eslint-disable-next-line no-shadow
    const self = this;
    for (const apiName of SUPPORTED_BASE_APIS) {
      if (apiName == "i18n") {
        let api = extension.apiManager.getAPI(
          apiName,
          extension,
          "addon_parent"
        );
        browser[apiName] = this.#implementation(extension, api, apiName);
      } else if (SUPPORTED_APIS_NO_EVENTS.includes(apiName)) {
        const subApiHandler = {
          get(target, prop) {
            if (apiName == "messages" && prop == "tags") {
              return new Proxy(
                {},
                {
                  get(obj, subProp) {
                    return self.#browserListener.bind(
                      null,
                      apiName,
                      prop,
                      subProp
                    );
                  },
                }
              );
            }
            return self.#browserListener.bind(null, apiName, prop, null);
          },
        };
        browser[apiName] = new Proxy({}, subApiHandler);
      } else {
        const asyncAPI = await extension.apiManager.asyncGetAPI(
          // contacts and addressBooks are actually contained within the same
          // API module.
          apiName == "contacts" || apiName == "addressBooks"
            ? "addressBook"
            : apiName,
          extension,
          "addon_parent"
        );
        browser[apiName] = this.#implementation(extension, asyncAPI, apiName);
      }
    }
    // Fake port connections.
    browser.runtime.connect = () => {
      return {
        disconnect() {
          self.#connectionListeners.delete(this.onMessagelistener);
          this.onMessage.listener = null;
        },
        onMessage: {
          listener: null,
          addListener(l) {
            self.#connectionListeners.add(l);
            this.listener = l;
          },
          removeListener(l) {
            self.#connectionListeners.delete(l);
            this.listener = null;
          },
        },
        async postMessage(msg) {
          let contact = await browser._background.request(msg);
          if (this.onMessage.listener) {
            this.onMessage.listener({
              type: "contactDetails",
              for: msg.payload.email,
              contact,
            });
          }
        },
      };
    };

    this.#asyncBrowser = browser;
    return browser;
  }

  sendMessage(msg) {
    for (let l of this.#connectionListeners) {
      l(msg);
    }
  }

  // This is provided so that we can call background scripts from stub.html.
  // Really this should be using the ports and browser.runtime.connect, but they
  // won't work until we're proper WebExtension page.
  callBackgroundFunc(apiName, apiFunc, args) {
    return this.#browserListener(apiName, apiFunc, null, ...args);
  }

  getWindowId(win) {
    return this.#context.extension.windowManager.convert(win).id;
  }

  getTabId(win, docWin) {
    let tabmail = win.document.getElementById("tabmail");

    // Assume first we're in a three-pane tab.
    let threePaneBrowser =
      docWin.browsingContext?.embedderElement?.ownerDocument?.ownerGlobal
        ?.browsingContext?.embedderElement;
    let tab = tabmail.tabInfo.find((t) => t.chromeBrowser == threePaneBrowser);

    if (tab?.mode.name != "mail3PaneTab") {
      // Are we in a tab instead?
      tab = tabmail.getTabForBrowser(
        docWin.browsingContext?.embedderElement || docWin.frameElement
      );
    }
    if (!tab) {
      // We are probably in a window all by ourselves fallback to getting the
      // selected tab.

      // Ideally we'd be loading a message in a content tab on its own, but
      // Thunderbird doesn't allow that yet.
      tab = tabmail.selectedTab;
    }
    return this.#context.extension.tabManager.convert(tab).id;
  }

  #implementation(extension, api, name) {
    let impl = api.getAPI(this.#context)[name];

    if (name == "storage") {
      impl.local.get = (...args) =>
        impl.local.callMethodInParentProcess("get", args);
      impl.local.set = (...args) =>
        impl.local.callMethodInParentProcess("set", args);
      impl.local.remove = (...args) =>
        impl.local.callMethodInParentProcess("remove", args);
      impl.local.clear = (...args) =>
        impl.local.callMethodInParentProcess("clear", args);
    }
    return impl;
  }
}

export const BrowserSim = new _BrowserSim();
