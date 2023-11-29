/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
  let onCreatedSpy;
  let onUpdatedSpy;
  let onDeletedSpy;

  beforeEach(() => {
    spy = jest.spyOn(browser.contacts, "quickSearch");
    onCreatedSpy = jest.spyOn(browser.contacts.onCreated, "addListener");
    onUpdatedSpy = jest.spyOn(browser.contacts.onUpdated, "addListener");
    onDeletedSpy = jest.spyOn(browser.contacts.onDeleted, "addListener");

    contactManager = new ContactManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should return an empty contact if none found", async () => {
    let contact = await contactManager.get("invalid@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: undefined,
      contactName: undefined,
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
      contactName: "display name",
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
      contactName: undefined,
      photoURI: "https://example.com/fake",
      readOnly: true,
    });
    expect(isValidColor(extra.color)).toBe(true);
  });

  test("should return a contact with exact match of email address", async () => {
    let contact = await contactManager.get("arch@example.com");

    expect(contact).toMatchObject({
      contactId: "3216549870",
      identityId: undefined,
      contactName: "arch test",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    contact = await contactManager.get("cond@example.com");

    expect(contact).toMatchObject({
      contactId: "9753124680",
      identityId: undefined,
      contactName: "cond test",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
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
      contactName: "display name",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(contact2).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      contactName: "display name",
      photoURI: undefined,
    });
    expect(isValidColor(contact2.color)).toBe(true);
  });

  test("should return a contact with identity set", async () => {
    let contact = await contactManager.get("id3@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: "id3",
      contactName: undefined,
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("id3@example.com");

    expect(contact2.color).toBe(contact.color);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should return the default identity if several identities match the email", async () => {
    let contact = await contactManager.get("id6@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: "id10",
      contactName: undefined,
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("id6@example.com");

    expect(contact2.color).toBe(contact.color);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should return a contact with address book and identity data", async () => {
    let contact = await contactManager.get("id4@example.com");

    expect(contact).toMatchObject({
      contactId: "15263748",
      identityId: "id4",
      contactName: "id4 card",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should only apply identity data to the matching email in the address book", async () => {
    let contact = await contactManager.get("id5@example.com");

    expect(contact).toMatchObject({
      contactId: "15263748",
      identityId: "id5",
      contactName: "id5 card",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    // Get it again from the cache.
    contact = await contactManager.get("id5@example.com");

    expect(contact).toMatchObject({
      contactId: "15263748",
      identityId: "id5",
      contactName: "id5 card",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    contact = await contactManager.get("id5second@example.com");

    expect(contact).toMatchObject({
      contactId: "15263748",
      identityId: undefined,
      contactName: "id5 card",
      photoURI: undefined,
    });
    expect(isValidColor(contact.color)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("should update when a new contact is added", async () => {
    let contact = await contactManager.get("invalid@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: undefined,
      contactName: undefined,
      photoURI: undefined,
    });

    let listener = onCreatedSpy.mock.calls[0][0];
    listener({
      properties: {
        PrimaryEmail: "invalid@example.com",
      },
    });

    spy.mockResolvedValueOnce([
      {
        id: "14327658",
        type: "contact",
        properties: {
          PrimaryEmail: "invalid@example.com",
          SecondEmail: "bar@example.com",
          DisplayName: "invalid name",
          PreferDisplayName: "1",
          PhotoURI: undefined,
        },
      },
    ]);

    contact = await contactManager.get("invalid@example.com");

    expect(contact).toMatchObject({
      contactId: "14327658",
      identityId: undefined,
      contactName: "invalid name",
      photoURI: undefined,
    });
  });

  test("should update when a contact is updated", async () => {
    let contact = await contactManager.get("foo@example.com");

    expect(contact).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      contactName: "display name",
      photoURI: undefined,
    });

    let listener = onUpdatedSpy.mock.calls[0][0];
    listener({
      properties: {
        PrimaryEmail: "foo@example.com",
      },
    });

    spy.mockResolvedValueOnce([
      {
        id: "135246",
        type: "contact",
        properties: {
          PrimaryEmail: "foo@example.com",
          SecondEmail: "bar@example.com",
          DisplayName: "updated name",
          PreferDisplayName: "1",
          PhotoURI: undefined,
        },
      },
    ]);

    contact = await contactManager.get("foo@example.com");

    expect(contact).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      contactName: "updated name",
      photoURI: undefined,
    });
  });

  test("should update when a new contact is deleted", async () => {
    let contact = await contactManager.get("foo@example.com");

    expect(contact).toMatchObject({
      contactId: "135246",
      identityId: undefined,
      contactName: "display name",
      photoURI: undefined,
    });

    let listener = onDeletedSpy.mock.calls[0][0];
    listener("1", "135246");

    spy.mockResolvedValueOnce([]);

    contact = await contactManager.get("foo@example.com");

    expect(contact).toMatchObject({
      contactId: undefined,
      identityId: undefined,
      contactName: undefined,
      photoURI: undefined,
    });
  });

  test("should limit the size of the cache", async () => {
    contactManager.HARD_MAX_CACHE_SIZE = 10;
    contactManager.CACHE_CLEANUP_AMOUNT = 5;
    for (let i = 0; i < 10; i++) {
      await contactManager.get(`${i}@example.com`);
    }

    expect(contactManager._cache.size).toBe(10);

    // Access a couple of the older addresses.
    await contactManager.get("1@example.com");
    await contactManager.get("3@example.com");
    // And access one more to trigger the reduction.
    await contactManager.get("10@example.com");

    // Let the reduction run.
    await new Promise((r) => setTimeout(r, 0));
    expect(contactManager._cache.size).toBe(5);

    expect(Array.from(contactManager._cache.keys())).toStrictEqual([
      "1@example.com",
      "3@example.com",
      "8@example.com",
      "9@example.com",
      "10@example.com",
    ]);
  });
});
