/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// This defines fetch() which is needed for thunderbird-compat import.
// eslint-disable-next-line no-unused-vars
import { waitForComponentToPaint } from "./utils.js";
import { browser } from "../content/es-modules/thunderbird-compat.js";
import { ContactManager, freshColor } from "../background/contactManager.js";

// From https://gist.github.com/olmokramer/82ccce673f86db7cda5e
function isValidColor(color) {
  if (color.charAt(0) === "#") {
    color = color.substring(1);
    return (
      [3, 4, 6, 8].indexOf(color.length) > -1 && !isNaN(parseInt(color, 16))
    );
  }
  return /^(rgb|hsl)a?\((\d+%?(deg|rad|grad|turn)?[,\s]+){2,3}[\s\/]*[\d\.]+%?\)$/i.test(
    color
  );
}

describe("Test utility functions", () => {
  test("freshColor turns an email into a valid hsl color", async () => {
    // Outputs a valid css color
    expect(isValidColor(freshColor("abc@fake.com"))).toBe(true);
    // Outputs the same color for the same email
    expect(freshColor("abc@fake.com")).toBe(freshColor("abc@fake.com"));
    // Outputs different colors for different emails
    expect(freshColor("abc@fake.com")).not.toBe(freshColor("cbc@fake.com"));
  });
});

describe("Test ContactManager", () => {
  let contactManager;
  let spy;
  beforeEach(() => {
    contactManager = new ContactManager();
    spy = jest.spyOn(browser.contacts, "quickSearch");
  });

  afterEach(() => {
    spy.mockRestore();
  });

  test("should return an empty contact if none found", async () => {
    let contact = await contactManager.get("invalid@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: undefined,
      name: undefined,
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("invalid@example.com");

    expect(contact2.color).toBe(contact.color);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should return a contact with address book data", async () => {
    let contact = await contactManager.get("foo@example.com");

    expect(contact).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      name: "display name",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("foo@example.com");

    expect(contact2.color).toBe(contact.color);
    expect(spy).toHaveBeenCalledTimes(1);

    let extra = await contactManager.get("extra@example.com");

    expect(extra).toMatchObject({
      contactId: "75312468",
      identityId: undefined,
      name: undefined,
      photoURI: "https://example.com/fake",
    });
    expect(isValidColor(extra.color)).toBe(true);
  });

  test("should only fetch a contact once if a fetch is already in progress", async () => {
    let resolveFn;
    let promise = new Promise((resolve) => {
      resolveFn = resolve;
    });
    spy.mockReturnValueOnce(promise);
    let contactPromise = contactManager.get("foo@example.com");
    let contact2Promise = contactManager.get("foo@example.com");
    resolveFn([
      {
        id: "135246",
        type: "contact",
        properties: {
          PrimaryEmail: "foo@example.com",
          SecondEmail: "bar@example.com",
          DisplayName: "display name",
          PreferDisplayName: "1",
          PhotoURI: undefined,
        },
      },
    ]);
    await promise;

    let contact = await contactPromise;
    let contact2 = await contact2Promise;

    expect(spy).toHaveBeenCalledTimes(1);

    expect(contact).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      name: "display name",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(contact2).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      name: "display name",
      photoURI: undefined,
    });
    expect(isValidColor(contact2.color)).toBe(true);
  });

  test("should return a contact with identity set", async () => {
    let contact = await contactManager.get("id3@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: "id3",
      name: undefined,
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("id3@example.com");

    expect(contact2.color).toBe(contact.color);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should return a contact with address book and identity data", async () => {
    let contact = await contactManager.get("id4@example.com");

    expect(contact).toMatchObject({
      contactId: "15263748",
      identityId: "id4",
      name: "id4 card",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test.todo("should update when a new contact is added");

  test.todo("should update when a contact is updated");

  test.todo("should update when a new contact is deleted");

  test.todo("should limit the size of the cache");
});
