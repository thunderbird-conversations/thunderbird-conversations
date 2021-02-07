/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import { Services } from "../content/es-modules/thunderbird-compat.js";
import {
  ThreadView,
  ThreePanelThunderbird,
} from "./components/thunderbird.jsx";
import { ConversationWrapper } from "../content/conversationWrapper.jsx";
import { store } from "./reducer.js";

/**
 * Widget to select the active locale to be used by `browser.i18n.getMessage()`
 *
 * @returns
 */
function LocaleSelector() {
  const locales = Services.locale.availableLocales;
  const [locale, setLocale] = React.useState(Services.locale.requestedLocale);
  return (
    <select
      name="locale"
      value={locale}
      onChange={(event) => {
        const newLocale = event.target.value;
        Services.locale.requestedLocale = newLocale;
        setLocale(newLocale);
      }}
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

// The entry point
export function Main() {
  return (
    <React.Fragment>
      <h2>Thunderbird Conversations Dev Frame</h2>
      <div className="dev-frame-description">
        The dev frame renders Conversations components in the browser for rapid
        development. Some, but not all, thunderbird functions are mocked.
      </div>
      <div className="dev-frame-options">
        <b style={{ marginRight: 5 }}>Dev Frame Options</b>
        <i>
          Locale: <LocaleSelector />
        </i>
      </div>
      <ReactRedux.Provider store={store}>
        <ThreePanelThunderbird
          left={<h4 className="faux-inbox">Inbox (200)</h4>}
          topRight={<ThreadView />}
          bottomRight={
            <div id="conversationWrapper">
              <ConversationWrapper />
            </div>
          }
        />
      </ReactRedux.Provider>
    </React.Fragment>
  );
}
