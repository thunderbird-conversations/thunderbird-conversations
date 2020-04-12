/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["BrowserSim"];

const { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

// This is a workaround whilst we still have stub.xhtml being loaded in the
// privileged scope. _ConversationUtils.getBrowser() simulates APIs and passes
// them back to the webExtension process for handling by the real APIs.
const SUPPORTED_BASE_APIS = [
  "convContacts",
  "conversations",
  "i18n",
  "messages",
  "runtime",
  "tabs",
];

const ADDON_ID = "gconversation@xulforum.org";

class _BrowserSim {
  setBrowserListener(listener) {
    this._browserListener = listener;
  }

  getBrowser() {
    if (this._browser) {
      return this._browser;
    }
    let extension = ExtensionParent.GlobalManager.getExtension(ADDON_ID);
    function implementation(api, name) {
      let impl = api.getAPI({ extension })[name];

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

    const browser = {};
    const self = this;
    for (const apiName of SUPPORTED_BASE_APIS) {
      if (apiName == "i18n") {
        let api = extension.apiManager.getAPI(
          apiName,
          extension,
          "addon_parent"
        );
        browser[apiName] = implementation(api, apiName);
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
}

var BrowserSim = new _BrowserSim();
