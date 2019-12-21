/* eslint-disable */
const esmImport = require("esm")(module, { cjs: false, force: true });
const { act } = require("react-dom/test-utils");
const enzyme = require("enzyme");
const Adapter = require("enzyme-adapter-react-16");

enzyme.configure({ adapter: new Adapter() });

// Browser code expects window to be the global object
global.window = global.globalThis = global;
// We need to make a global nodeRequire function so that our module
// loading will use native node module loading instead of the default.
global.nodeRequire = require;

// Mock `fetch`, which is used to get localization info when running in the browser
global.fetch = function(url) {
  const fileSystem = require("fs");
  const path = require("path");
  const ROOT_PATH = path.join(__dirname, "..");
  const filePath = path.join(ROOT_PATH, url);

  const data = fileSystem.readFileSync(filePath, "utf8");
  return Promise.resolve({
    json: function() {
      return Promise.resolve(JSON.parse(data));
    },
  });
};

// Workaround for warnings about component not being wrapped in `act()`/
// Taken from https://github.com/airbnb/enzyme/issues/2073#issuecomment-565736674
const waitForComponentToPaint = async wrapper => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    wrapper.update();
  });
};

//
// Load the modules for our tests. Since we are using native ESM
// modules here, we need to use esmImport to load the files.
//
//esmImport("../content/es-modules/modules-compat.js");
const { browser, i18n } = esmImport(
  "../content/es-modules/thunderbird-compat.js"
);
// Import the same copy of React that the ui components are using
// because multiple versions of react can cause trouble. ui components
// import `ui.js`.
const { React } = esmImport("../content/es-modules/ui.js");

// Import the components we want to test
const {
  BinaryOption,
  NumericOption,
  TextOption,
  ChoiceOption,
  Main,
  store,
  actions,
} = esmImport("../options.js");

describe("Option components have correct return values", () => {
  test("NumericOption always returns a numeric type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <NumericOption onChange={callback} name="option_name" value={7} />
    );
    // Put in a number and expect it back
    option.find("input").simulate("change", { target: { value: "45" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(45);
    expect(typeof callback.mock.calls[0][1]).toBe("number");

    // Put in a non-number and expect it to still return a number
    option.find("input").simulate("change", { target: { value: "abc" } });

    expect(typeof callback.mock.calls[1][1]).toBe("number");
  });

  test("BinaryOption always returns a boolean type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <BinaryOption onChange={callback} name="option_name" value={true} />
    );
    option.find("input").simulate("change", { target: { checked: true } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(true);
    expect(typeof callback.mock.calls[0][1]).toBe("boolean");

    option.find("input").simulate("change", { target: { checked: false } });

    expect(callback.mock.calls[1][1]).toBe(false);
  });

  test("TextOption always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextOption onChange={callback} name="option_name" value={"first text"} />
    );
    option
      .find("input")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("ChoiceOption always returns the value supplied", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <ChoiceOption
        onChange={callback}
        name="option_name"
        choices={[
          { desc: "item1", value: 5 },
          { desc: "item2", value: 10 },
          { desc: "item3", value: "abc" },
        ]}
        value={5}
      />
    );
    // We have three choices, so there are three input radio buttons
    const options = option.find("input");
    options.at(0).simulate("change", { target: { checked: true } });
    options.at(1).simulate("change", { target: { checked: true } });
    options.at(2).simulate("change", { target: { checked: true } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe(5);
    expect(callback.mock.calls[1][1]).toBe(10);
    expect(callback.mock.calls[2][1]).toBe("abc");
  });
});

describe("Option Reducer and Actions tests", () => {
  const mockedGet = jest.spyOn(browser.storage.local, "get");
  const mockedSet = jest.spyOn(browser.storage.local, "set");

  test("initPrefs() retrieves preferences from `browser.storage.local`", async () => {
    const initailCallLength = mockedGet.mock.calls.length;
    await store.dispatch(actions.initPrefs());
    // When we initialize preferences, there should be one call to "get"
    expect(mockedGet).toHaveBeenCalled();
    // That call should have requested the "preferences" object
    expect(mockedGet.mock.calls[mockedGet.mock.calls.length - 1][0]).toBe(
      "preferences"
    );
  });

  test("savePref() sets a pref in `browser.storage.local`", async () => {
    await store.dispatch(actions.savePref("_custom_pref", 100));
    // That call should have set a property on the "preferences" object
    expect(
      mockedSet.mock.calls[mockedSet.mock.calls.length - 1][0]
    ).toMatchObject({ preferences: { _custom_pref: 100 } });
  });
});

function Abc(props) {
  //const a=5
  const [a, b] = React.useState("no val");
  return <div>{a}</div>;
}

describe("Option full page tests", () => {
  const mockedSet = jest.spyOn(browser.storage.local, "set");

  test("Toggling an option changes the setting in browser.storage.local", async () => {
    const main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    const option = main.find(BinaryOption).at(0);
    const input = option.find("input");
    const name = option.props()["name"];

    // We are going to click on the option and we expect that it's new value
    // is saved via `browser.storage.local.set`
    input.simulate("change", { target: { checked: false } });
    const beforeChange = mockedSet.mock.calls.pop();
    expect(beforeChange[0]).toMatchObject({ preferences: { [name]: false } });

    input.simulate("change", { target: { checked: true } });
    const afterChange = mockedSet.mock.calls.pop();
    expect(afterChange[0]).toMatchObject({ preferences: { [name]: true } });
  });
});
