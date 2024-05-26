/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import {
  initializeI18n,
  // eslint-disable-next-line no-shadow
  browser,
} from "../content/esmodules/thunderbirdCompat.mjs";
import {
  ThreadView,
  ThreePanelThunderbird,
} from "./components/thunderbird.mjs";
import { ConversationWrapper } from "../content/components/conversation/conversationWrapper.mjs";
import { store } from "./reducer.mjs";

globalThis.browser = browser;

/**
 * Widget to select the active locale to be used by `browser.i18n.getMessage()`
 *
 * @returns {object}
 */
function LocaleSelector() {
  const [locales, setLocales] = React.useState([]);
  const [locale, setLocale] = React.useState("en");

  // Asynchronously fetch a list of the available locales
  React.useEffect(() => {
    (async () => {
      setLocales(await browser.i18n.getAcceptLanguages());
    })();
  });

  return React.createElement(
    "select",
    {
      name: "locale",
      value: locale,
      onChange: (event) => {
        const newLocale = event.target.value;
        // Propagate the locale change back to the mocked `browser.i18n` instance.
        initializeI18n(() => {}, newLocale);
        setLocale(newLocale);
      },
    },
    locales.map((l) => React.createElement("option", { key: l, value: l }, l))
  );
}

// The entry point
export function Main() {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("h2", null, "Thunderbird Conversations Dev Frame"),
    React.createElement(
      "div",
      { className: "dev-frame-description" },
      "The dev frame renders Conversations components in the browser for rapid" +
        "development. Some, but not all, thunderbird functions are mocked."
    ),
    React.createElement(
      "div",
      { className: "dev-frame-options" },
      React.createElement(
        "b",
        { style: { marginRight: 5 } },
        "Dev Frame Options"
      ),
      React.createElement(
        "i",
        null,
        "Locale: ",
        React.createElement(LocaleSelector)
      )
    ),
    React.createElement(
      ReactRedux.Provider,
      { store },
      React.createElement(ThreePanelThunderbird, {
        left: React.createElement(
          "h4",
          { className: "faux-inbox" },
          "Inbox (200)"
        ),
        topRight: React.createElement(ThreadView),
        bottomRight: React.createElement(
          "div",
          { id: "conversationWrapper" },
          React.createElement(ConversationWrapper)
        ),
      })
    )
  );
}
