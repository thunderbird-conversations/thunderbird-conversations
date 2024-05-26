/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser, i18n } from "../content/esmodules/thunderbirdCompat.mjs";
import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import PropTypes from "prop-types";

const prefsSlice = RTK.createSlice({
  name: "prefs",
  initialState: {},
  reducers: {
    set(state, { payload }) {
      return { ...state, ...payload };
    },
  },
});
export const actions = {
  initPrefs() {
    return async function (dispatch) {
      const prefs = await browser.storage.local.get("preferences");
      dispatch(prefsSlice.actions.set(prefs.preferences));
    };
  },
  savePref(name, value) {
    return async function (dispatch, getState) {
      const newPrefs = { ...getState(), [name]: value };
      await browser.storage.local.set({ preferences: newPrefs });
      dispatch(prefsSlice.actions.set(newPrefs));
    };
  },
};

export const store = RTK.configureStore({ reducer: prefsSlice.reducer });
store.dispatch(actions.initPrefs());

// A list of all preferences that can be set via the GUI.
// `desc` and `name` will get run through l10n before being rendered
const PREFS_INFO = [
  {
    props: {
      title: "",
      desc: "options.expand_who",
      name: "expand_who",
      choices: [
        { desc: "options.expand_none", value: 1 },
        { desc: "options.expand_all", value: 3 },
        { desc: "options.expand_auto", value: 4 },
      ],
    },
    component: ChoiceOption,
  },
  {
    props: {
      title: "options.quoting_title",
      desc: "options.quoting_desc",
      name: "hide_quote_length",
    },
    component: NumericOption,
  },
  {
    props: {
      title: "options.hide_sigs_title",
      desc: "options.hide_sigs_desc",
      name: "hide_sigs",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.friendly_date_title",
      desc: "options.friendly_date_desc",
      name: "no_friendly_date",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.tweak_chrome_title",
      desc: "options.tweak_chrome_desc",
      name: "tweak_chrome",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.tweak_bodies_title",
      desc: "options.tweak_bodies_desc",
      name: "tweak_bodies",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.operate_on_conversations_title",
      desc: "options.operate_on_conversations_desc",
      name: "operate_on_conversations",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.extra_attachments_title",
      desc: "options.extra_attachments_desc",
      name: "extra_attachments",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.hide_quick_reply_title",
      desc: "options.hide_quick_reply_desc",
      name: "hide_quick_reply",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.disable_between_column_title",
      desc: "options.disable_between_column_desc",
      name: "disableBetweenColumn",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.compose_in_tab2_title",
      desc: "options.compose_in_tab2_desc",
      name: "compose_in_tab",
    },
    component: BinaryOption,
  },
  {
    props: {
      title: "options.debugging_title",
      desc: "options.debugging_desc",
      name: "logging_enabled",
    },
    component: BinaryOption,
  },
];

/**
 * Localize `PREFS_INFO` or a single string using
 * `i18n.getMessage(...)`
 *
 * @param {(string | object[])} prefsInfo
 * @param {object} [i18n]
 * @returns {(string | object[])}
 */
function localize(prefsInfo, i18n = browser.i18n) {
  if (!i18n) {
    throw new Error("`i18n` object not specified");
  }
  if (typeof prefsInfo === "string") {
    return i18n.getMessage(prefsInfo);
  }
  // If `prefsInfo` is an array, it is an array of information used
  // to render the preference setting GUI. Localize all `desc` and `title`
  // properties
  if (Array.isArray(prefsInfo)) {
    return prefsInfo.map((pref) => {
      const retProps = { ...pref.props };
      if (retProps.desc) {
        retProps.desc = i18n.getMessage(retProps.desc);
      }
      if (retProps.title) {
        retProps.title = i18n.getMessage(retProps.title);
      }
      if (retProps.choices) {
        retProps.choices = retProps.choices.map((choice) => {
          if (choice.desc) {
            return { ...choice, desc: i18n.getMessage(choice.desc) };
          }
          return choice;
        });
      }
      return { ...pref, props: retProps };
    });
  }
  throw new Error("Don't know how to localize the object", prefsInfo);
}

function openSetupAssistant() {
  browser.tabs.create({
    url: "../assistant/assistant.html",
  });
}

async function runUndoConversations() {
  let port = browser.runtime.connect({ name: "assistant" });
  port.postMessage({});
}

//
// React components to render the options types
//

export function ChoiceOption({
  title,
  desc,
  choices = [],
  value,
  name,
  onChange,
}) {
  const elementName = `choice_${title}`.replace(/\s+/g, "");
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      null,
      React.createElement("label", { className: "title" }, title),
      React.createElement("br"),
      React.createElement("label", null, desc)
    ),
    React.createElement(
      "div",
      null,
      choices.map((choice, i) =>
        React.createElement(
          "span",
          { key: i },
          React.createElement("input", {
            type: "radio",
            className: "pref",
            id: `${elementName}-${i}`,
            name: elementName,
            value: choice.value,
            checked: choice.value === value,
            onChange: () => {
              onChange(name, choice.value);
            },
          }),
          React.createElement(
            "label",
            { htmlFor: `${elementName}-${i}` },
            choice.desc
          )
        )
      )
    )
  );
}
ChoiceOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.any.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  choices: PropTypes.arrayOf(
    PropTypes.shape({ value: PropTypes.any, desc: PropTypes.string })
  ).isRequired,
};

export function TextOption({
  title,
  desc,
  value = "",
  name,
  onChange = () => {},
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      null,
      React.createElement(
        "label",
        { htmlFor: name, className: "title" },
        title
      ),
      React.createElement("br"),
      React.createElement("label", null, desc)
    ),
    React.createElement(
      "div",
      null,
      React.createElement("input", {
        id: name,
        type: "text",
        className: "pref",
        value: value,
        onChange: (e) => {
          onChange(name, e.target.value);
        },
      })
    )
  );
}
TextOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export function NumericOption({
  title,
  desc,
  value = 0,
  name,
  onChange = () => {},
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      null,
      React.createElement(
        "label",
        { htmlFor: name, className: "title" },
        title
      ),
      React.createElement("br"),
      React.createElement("label", null, desc)
    ),
    React.createElement(
      "div",
      null,
      React.createElement("input", {
        id: name,
        type: "number",
        className: "pref hidespinbuttons",
        min: 0,
        max: 100,
        value: value,
        onChange: (e) => {
          onChange(name, parseInt(e.target.value || value, 10));
        },
      })
    )
  );
}
NumericOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export function BinaryOption({
  title,
  desc,
  value = false,
  name,
  onChange = () => {},
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      null,
      React.createElement(
        "label",
        { htmlFor: name, className: "title" },
        title
      ),
      React.createElement("br"),
      React.createElement("label", null, desc)
    ),
    React.createElement(
      "div",
      null,
      React.createElement("input", {
        id: name,
        type: "checkbox",
        className: "pref",
        checked: value,
        onChange: (e) => {
          onChange(name, e.target.checked);
        },
      })
    )
  );
}
BinaryOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.bool.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

/**
 * Render the options list for Conversations. `localizedPrefsInfo`
 * should be an array following the format of `PREFS_INFO`, but
 * localized. `localizedName` is the localized name of the extension.
 * `prefs` should be an object whose keys are the `name`s mentioned in
 * `localizedPrefsInfo`. And, `setPref` should be a function that accepts
 * `(name, value)` pairs and saves them as preferences.
 *
 * @param {object} root0
 * @param {object[]} root0.localizedPrefsInfo
 * @param {string} root0.localizedName
 * @param {string}root0.localizedStartAssistant
 * @param {string} root0.localizedUndoCustomizations
 * @param {string} root0.localizedUndoCustomizationsTooltip
 * @param {object} root0.prefs
 * @param {Function} root0.setPref
 * @param {Function} root0.startSetupAssistant
 * @param {Function} root0.startUndoConversations
 * @returns {React.Node}
 */
function _ConversationOptions({
  localizedPrefsInfo,
  localizedName,
  localizedStartAssistant,
  localizedUndoCustomizations,
  localizedUndoCustomizationsTooltip,
  prefs,
  setPref,
  startSetupAssistant,
  startUndoConversations,
}) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("h1", null, localizedName),
    React.createElement(
      "form",
      { id: "conversationOptions" },
      React.createElement(
        "div",
        { id: "preferencesGrid" },
        localizedPrefsInfo.map((Item, i) =>
          React.createElement(Item.component, {
            ...Item.props,
            key: i,
            value: prefs[Item.props.name],
            onChange: setPref,
          })
        )
      )
    ),
    React.createElement(
      "button",
      { className: "start", onClick: startSetupAssistant },
      localizedStartAssistant
    ),
    React.createElement(
      "button",
      {
        className: "undo",
        onClick: startUndoConversations,
        title: localizedUndoCustomizationsTooltip,
      },
      localizedUndoCustomizations
    )
  );
}
_ConversationOptions.propTypes = {
  localizedPrefsInfo: PropTypes.array.isRequired,
  localizedName: PropTypes.string.isRequired,
  localizedStartAssistant: PropTypes.string.isRequired,
  localizedUndoCustomizations: PropTypes.string.isRequired,
  localizedUndoCustomizationsTooltip: PropTypes.string.isRequired,
  prefs: PropTypes.object.isRequired,
  setPref: PropTypes.func.isRequired,
  startSetupAssistant: PropTypes.func.isRequired,
  startUndoConversations: PropTypes.func.isRequired,
};

const ConversationOptions = ReactRedux.connect((state) => ({ prefs: state }), {
  setPref: actions.savePref,
})(_ConversationOptions);

// The entry point for the options page
export function Main() {
  const [localizedName, setLocalizedName] = React.useState(
    localize("extensionName", i18n)
  );
  const [localizedPrefsInfo, setLocalizedPrefsInfo] = React.useState(
    localize(PREFS_INFO, i18n)
  );
  const [localizedStartAssistant, setLocalizedStartAssistant] = React.useState(
    localize("options.start_setup_assistant", i18n)
  );
  const [localizedUndoCustomizations, setLocalizedUndoCustomizations] =
    React.useState(localize("options.undoCustomizations", i18n));
  const [
    localizedUndoCustomizationsTooltip,
    setLocalizedUndoCustomizationsTooltip,
  ] = React.useState(localize("options.undoCustomizations.tooltip", i18n));

  // When the i18n library is loaded, we want to translate all
  // the localized strings.
  React.useEffect(() => {
    if (!i18n.isPolyfilled) {
      // The native `browser.i18n` is synchronous, so if we're using
      // that version, the translations have already been loaded; do
      // nothing here
      return;
    }
    i18n.initialize();
    i18n.isLoaded
      .then(() => {
        setLocalizedName(localize("extensionName", i18n));
        setLocalizedPrefsInfo(localize(PREFS_INFO, i18n));
        setLocalizedStartAssistant(
          localize("options.start_setup_assistant", i18n)
        );
        setLocalizedUndoCustomizations(
          localize("options.undoCustomizations", i18n)
        );
        setLocalizedUndoCustomizationsTooltip(
          localize("options.undoCustomizations.tooltip", i18n)
        );
      })
      .catch((e) => {
        throw e;
      });
  }, []);

  return React.createElement(
    ReactRedux.Provider,
    { store },
    React.createElement(ConversationOptions, {
      localizedPrefsInfo: localizedPrefsInfo,
      localizedName: localizedName,
      localizedStartAssistant: localizedStartAssistant,
      localizedUndoCustomizations: localizedUndoCustomizations,
      localizedUndoCustomizationsTooltip: localizedUndoCustomizationsTooltip,
      startSetupAssistant: openSetupAssistant,
      startUndoConversations: runUndoConversations,
    })
  );
}
