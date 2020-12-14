/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["BrowserSim"];

// This is a workaround whilst we still have stub.xhtml being loaded in the
// privileged scope. BrowserSim.getBrowser() simulates APIs and passes
// them back to the webExtension process for handling by the real APIs.
const SUPPORTED_BASE_APIS = [
  "convContacts",
  "convMsgWindow",
  "conversations",
  "i18n",
  "messageDisplay",
  "messages",
  "runtime",
  "storage",
  "tabs",
  "compose",
  "contacts",
  "addressBooks",
];

class _BrowserSim {
  setBrowserListener(listener, context) {
    if (!listener) {
      delete this._browser;
      delete this._asyncBrowser;
      delete this._browserListener;
      delete this._context;
      return;
    }
    this._browserListener = listener;
    this._context = context;
    if (this._waitingForContext) {
      this._waitingForContext();
      delete this._waitingForContext;
    }
  }

  getBrowser() {
    if (this._browser) {
      return this._browser;
    }
    let { extension } = this._context;
    const browser = {};
    const self = this;
    for (const apiName of SUPPORTED_BASE_APIS) {
      if (apiName == "i18n") {
        let api = extension.apiManager.getAPI(
          apiName,
          extension,
          "addon_parent"
        );
        browser[apiName] = this._implementation(extension, api, apiName);
      } else {
        // To use the extension.apiManager functionality here, we'd have to
        // make getBrowser an async function. I don't really want to do that
        // at this time as that's different to the actual API, so take the
        // slightly more expensive route of passing everything back through the
        // experiment API.
        // const asnycAPI = await extension.apiManager.asyncGetAPI(apiName, extension, "addon_parent");
        // return implementation(asnycAPI);
        const subApiHandler = {
          get(obj, prop) {
            return self._browserListener.bind(null, apiName, prop);
          },
        };
        browser[apiName] = new Proxy({}, subApiHandler);
      }
    }
    this._browser = browser;
    return browser;
  }

  // Async version of getBrowser that we can use in stub.xhtml and other places
  // we can do async directly rather than going back across the webextension
  // APIs.
  // Note: this allows use of the event APIs.
  // Important note: Only the messages API has schema validation performed on it
  // due to the override below. Any other API that has optional parameters may
  // need those parameters setting to null.
  async getBrowserAsync() {
    if (this._asyncBrowser) {
      return this._asyncBrowser;
    }
    if (!this._context) {
      await new Promise((resolve) => {
        this._waitingForContext = resolve;
      });
    }
    let { extension } = this._context;

    const browser = {};
    const self = this;
    for (const apiName of SUPPORTED_BASE_APIS) {
      if (apiName == "i18n") {
        let api = extension.apiManager.getAPI(
          apiName,
          extension,
          "addon_parent"
        );
        browser[apiName] = this._implementation(extension, api, apiName);
      } else if (apiName == "messages") {
        // For messages, we don't currently need the events API. Use the
        // proxy set-up so that we can gain the benefit of the field validation
        // that going through the APIs provides (namely setting unused fields
        // to null) as this saves us being explicit about unused fields.
        const subApiHandler = {
          get(obj, prop) {
            return self._browserListener.bind(null, apiName, prop);
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
        browser[apiName] = this._implementation(extension, asyncAPI, apiName);
      }
    }
    this._asyncBrowser = browser;
    return browser;
  }

  // This is provided so that we can call background scripts from stub.html.
  // Really this should be using the ports and browser.runtime.connect, but they
  // won't work until we're proper WebExtension page.
  callBackgroundFunc(apiName, apiFunc, args) {
    return this._browserListener(apiName, apiFunc, ...args);
  }

  getWindowId(win) {
    return this._context.extension.windowManager.convert(win).id;
  }

  getTabId(win, docWin) {
    let tabmail = win.document.getElementById("tabmail");
    let tab = tabmail.getTabForBrowser(docWin.frameElement);
    if (!tab) {
      return null;
    }
    return this._context.extension.tabManager.convert(tab).id;
  }

  _implementation(extension, api, name) {
    let impl = api.getAPI(this._context)[name];

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

var BrowserSim = new _BrowserSim();
