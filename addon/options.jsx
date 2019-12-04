/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// TODO: Some of this preference code should be in the background script prefs.js,
// however we currently aren't able to use sendMessage to send to both the
// background script and to bootstrap.js.

import { browser } from "./content/es-modules/thunderbird-compat.js";
import {
  React,
  ReactDOM,
  RTK,
  ReactRedux,
  PropTypes,
} from "./content/es-modules/ui.js";

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
      title: "options.monospaced_senders_title",
      desc: "options.monospaced_senders_desc",
      name: "monospaced_senders",
    },
    component: TextOption,
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
      title: "options.compose_in_tab_title",
      desc: "options.compose_in_tab_desc",
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
 * `browser.i18n.getMessage(...)`
 *
 * @param {(string | object[])} prefsInfo
 * @returns {(string | object[])}
 */
function localize(prefsInfo) {
  if (typeof prefsInfo === "string") {
    return browser.i18n.getMessage(prefsInfo);
  }
  // If `prefsInfo` is an array, it is an array of information used
  // to render the prefernce setting GUI. Localize all `desc` and `title`
  // properties
  if (Array.isArray(prefsInfo)) {
    return prefsInfo.map(pref => {
      const retProps = pref.props;
      if (retProps.desc) {
        retProps.desc = browser.i18n.getMessage(retProps.desc);
      }
      if (retProps.title) {
        retProps.title = browser.i18n.getMessage(retProps.title);
      }
      if (retProps.choices) {
        retProps.choices = retProps.choices.map(choice => {
          if (choice.desc) {
            return { ...choice, desc: browser.i18n.getMessage(choice.desc) };
          }
          return choice;
        });
      }
      return { ...pref, props: retProps };
    });
  }
  throw new Error("Don't know how to localize the object", prefsInfo);
}

//
// React components to render the options types
//

function ChoiceOption({ title, desc, choices = [], value, name, onChange }) {
  const elementName = `choice_${title}`.replace(/\s+/g, "");
  return (
    <>
      <div>
        <label className="title">{title}</label>
        <br />
        <label>{desc}</label>
      </div>
      <div>
        {choices.map((choice, i) => (
          <span key={i}>
            <input
              type="radio"
              className="pref"
              id={`${elementName}-${i}`}
              name={elementName}
              value={choice.value}
              checked={choice.value === value}
              onChange={() => {
                onChange(name, choice.value);
              }}
            />
            <label htmlFor={`${elementName}-${i}`}>{choice.desc}</label>
          </span>
        ))}
      </div>
    </>
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

function TextOption({ title, desc, value = "", name, onChange = () => {} }) {
  return (
    <>
      <div>
        <label className="title">{title}</label>
        <br />
        <label>{desc}</label>
      </div>
      <div>
        <input
          type="text"
          className="pref"
          value={value}
          onChange={e => {
            onChange(name, e.target.value);
          }}
        />
      </div>
    </>
  );
}
TextOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

function NumericOption({ title, desc, value = 0, name, onChange = () => {} }) {
  return (
    <>
      <div>
        <label className="title">{title}</label>
        <br />
        <label>{desc}</label>
      </div>
      <div>
        <input
          type="number"
          className="pref"
          min={0}
          onChange={e => {
            onChange(name, parseInt(e.target.value || value, 10));
          }}
          value={value}
        />
      </div>
    </>
  );
}
NumericOption.propTypes = {
  title: PropTypes.string,
  desc: PropTypes.string,
  value: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

function BinaryOption({
  title,
  desc,
  value = false,
  name,
  onChange = () => {},
}) {
  return (
    <>
      <div>
        <label className="title">{title}</label>
        <br />
        <label>{desc}</label>
      </div>
      <div>
        <input
          type="checkbox"
          className="pref"
          checked={value}
          onChange={e => {
            onChange(name, e.target.checked);
          }}
        />
      </div>
    </>
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
 * @param {*} {
 *   localizedPrefsInfo,
 *   localizedName,
 *   prefs,
 *   setPref,
 * }
 * @returnType {React.Node}
 */
function _ConversationOptions({
  localizedPrefsInfo,
  localizedName,
  prefs,
  setPref,
}) {
  return (
    <>
      <h1>{localizedName}</h1>
      <form id="conversationOptions">
        <div id="preferencesGrid">
          {localizedPrefsInfo.map((Item, i) => (
            <Item.component
              {...Item.props}
              key={i}
              value={prefs[Item.props.name]}
              onChange={setPref}
            />
          ))}
        </div>
      </form>
    </>
  );
}
_ConversationOptions.propTypes = {
  localizedPrefsInfo: PropTypes.array.isRequired,
  localizedName: PropTypes.string.isRequired,
  prefs: PropTypes.object.isRequired,
  setPref: PropTypes.func.isRequired,
};

const ConversationOptions = ReactRedux.connect(state => ({ prefs: state }), {
  setPref: savePref,
})(_ConversationOptions);

//
// Create the redux store and appropriate actions/thunks
// using Redux Toolkit (RTK)
//
const { createSlice, configureStore } = RTK;

const prefsSlice = createSlice({
  name: "prefs",
  initialState: {},
  reducers: {
    set(state, { payload }) {
      return { ...state, ...payload };
    },
  },
});

function initPrefs() {
  return async function(dispatch) {
    const prefs = await browser.storage.local.get("preferences");
    dispatch(prefsSlice.actions.set(prefs.preferences));
  };
}

function savePref(name, value) {
  return async function(dispatch, getState) {
    const newPrefs = { ...getState(), [name]: value };
    await browser.storage.local.set({ preferences: newPrefs });
    dispatch(prefsSlice.actions.set(newPrefs));
  };
}

const store = configureStore({ reducer: prefsSlice.reducer });

// Initialize the preferences
store.dispatch(initPrefs());

// Render the preferences page
ReactDOM.render(
  <ReactRedux.Provider store={store}>
    <ConversationOptions
      localizedPrefsInfo={localize(PREFS_INFO)}
      localizedName={localize("extensionName")}
    />
  </ReactRedux.Provider>,
  document.querySelector("#root")
);
