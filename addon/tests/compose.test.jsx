/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* eslint-env jest */

// Standard imports for all tests
const {
  esmImport,
  enzyme,
  React,
  waitForComponentToPaint,
  browser,
} = require("./utils");

// Import the components we want to test
const { Main, store, actions } = esmImport("../compose/compose.js");
const { TextArea, TextBox } = esmImport("../compose/composeFields.js");

describe("Compose components have correct return values", () => {
  test("TextBox always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextBox
        disabled={false}
        onChange={callback}
        name="option_name"
        value={"first text"}
      />
    );
    option
      .find("input")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });

  test("TextArea always returns a string type", () => {
    const callback = jest.fn();
    const option = enzyme.shallow(
      <TextArea onChange={callback} name="option_name" value={"first text"} />
    );
    option
      .find("textarea")
      .simulate("change", { target: { value: "my special text" } });

    expect(callback.mock.calls[0][0]).toBe("option_name");
    expect(callback.mock.calls[0][1]).toBe("my special text");
    expect(typeof callback.mock.calls[0][1]).toBe("string");
  });
});

describe("Compose Reducer and Actions tests", () => {
  let mockedList;
  let mockedGet;
  let mockedSend;

  beforeEach(() => {
    mockedList = jest.spyOn(browser.accounts, "list");
    mockedGet = jest.spyOn(browser.accounts, "get");
    mockedSend = jest.spyOn(browser.convCompose, "send");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("initCompose() retrieves the default identity information", async () => {
    await store.dispatch(actions.initCompose());

    expect(mockedList).toHaveBeenCalled();
    expect(mockedGet).toHaveBeenCalled();

    // Should have correctly set up the initial values.
    expect(store.getState()).toStrictEqual({
      from: "1@example.com",
      identityId: "id1",
      email: "1@example.com",
    });
  });

  test("setValue() sets a value in the store", async () => {
    await store.dispatch(actions.setValue("_custom", "test"));

    expect(store.getState()).toHaveProperty("_custom", "test");
  });

  test("sendMessage() sends a message", async () => {
    await store.dispatch(actions.setValue("to", "me@example.com"));
    await store.dispatch(actions.setValue("subject", "Test"));
    await store.dispatch(actions.setValue("body", "Hello"));
    await store.dispatch(actions.sendMessage("custom"));

    expect(mockedSend).toHaveBeenCalledWith({
      from: "id1",
      to: "me@example.com",
      subject: "Test",
      body: "Hello",
    });
  });
});

describe("Compose full page tests", () => {
  let mockedSend;

  beforeEach(() => {
    mockedSend = jest.spyOn(browser.convCompose, "send");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("A message can be sent", async () => {
    const main = enzyme.mount(<Main />);

    waitForComponentToPaint(main);

    const inputs = main.find(TextBox);
    for (let i = 0; i < inputs.length; i++) {
      const inputBox = inputs.at(i);
      const name = inputBox.props().name;
      if (name != "from") {
        inputBox.find("input").simulate("change", { target: { value: name } });
      }
    }

    const textArea = main.find(TextArea).at(0);
    textArea
      .find("textarea")
      .simulate("change", { target: { value: "testArea" } });

    const sendButton = main.find("button");
    sendButton.simulate("click");

    expect(mockedSend).toHaveBeenCalledWith({
      from: "id1",
      to: "to",
      subject: "subject",
      body: "testArea",
    });
  });
});
