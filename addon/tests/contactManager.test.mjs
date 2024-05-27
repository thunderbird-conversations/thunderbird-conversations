/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { ContactManager, freshColor } from "../background/contactManager.mjs";

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
  it("freshColor turns an email into a valid hsl color", async () => {
    // Outputs a valid css color
    assert.equal(isValidColor(freshColor("abc@fake.com")), true);
    // Outputs the same color for the same email
    assert.equal(freshColor("abc@fake.com"), freshColor("abc@fake.com"));
    // Outputs different colors for different emails
    assert.notEqual(freshColor("abc@fake.com"), freshColor("cbc@fake.com"));
  });
});

describe("Test ContactManager", () => {
  let contactManager;
  let spy;
  let onCreatedSpy;
  let onUpdatedSpy;
  let onDeletedSpy;

  beforeEach((t) => {
    spy = t.mock.method(browser.contacts, "quickSearch");
    onCreatedSpy = t.mock.method(browser.contacts.onCreated, "addListener");
    onUpdatedSpy = t.mock.method(browser.contacts.onUpdated, "addListener");
    onDeletedSpy = t.mock.method(browser.contacts.onDeleted, "addListener");

    contactManager = new ContactManager();
  });

  it("should return an empty contact if none found", async () => {
    let contact = await contactManager.get("invalid@example.com");

    assert.equal(contact.contactId, undefined);
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, undefined);
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("invalid@example.com");

    assert.equal(contact2.color, contact.color);
    assert.equal(spy.mock.calls.length, 1);
  });

  it("should return a contact with address book data", async () => {
    let contact = await contactManager.get("foo@example.com");

    assert.equal(contact.contactId, "135246");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "display name");
    assert.equal(contact.photoURI, undefined);

    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("foo@example.com");

    assert.equal(contact2.color, contact.color);
    assert.equal(spy.mock.calls.length, 1);

    let extra = await contactManager.get("extra@example.com");

    assert.equal(extra.contactId, "75312468");
    assert.equal(extra.identityId, undefined);
    assert.equal(extra.contactName, undefined);
    assert.equal(extra.photoURI, "https://example.com/fake");
    assert.equal(extra.readOnly, true);

    assert.equal(isValidColor(extra.color), true);
  });

  it("should return a contact with exact match of email address", async () => {
    let contact = await contactManager.get("arch@example.com");

    assert.equal(contact.contactId, "3216549870");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "arch test");
    assert.equal(contact.photoURI, undefined);

    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    contact = await contactManager.get("cond@example.com");

    assert.equal(contact.contactId, "9753124680");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "cond test");
    assert.equal(contact.photoURI, undefined);

    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 2);
  });

  it("should only fetch a contact once if a fetch is already in progress", async () => {
    let { promise, resolve } = Promise.withResolvers();
    spy.mock.mockImplementation(() => promise);
    let contactPromise = contactManager.get("foo@example.com");
    let contact2Promise = contactManager.get("foo@example.com");
    resolve([
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

    assert.equal(spy.mock.calls.length, 1);

    assert.equal(contact.contactId, "135246");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "display name");
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);

    assert.equal(contact2.contactId, "135246");
    assert.equal(contact2.identityId, undefined);
    assert.equal(contact2.contactName, "display name");
    assert.equal(contact2.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
  });

  it("should return a contact with identity set", async () => {
    let contact = await contactManager.get("id3@example.com");

    assert.equal(contact.contactId, undefined);
    assert.equal(contact.identityId, "id3");
    assert.equal(contact.contactName, undefined);
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("id3@example.com");

    assert.equal(contact2.color, contact.color);
    assert.equal(spy.mock.calls.length, 1);
  });

  it("should return the default identity if several identities match the email", async () => {
    let contact = await contactManager.get("id6@example.com");

    assert.equal(contact.contactId, undefined);
    assert.equal(contact.identityId, "id10");
    assert.equal(contact.contactName, undefined);
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    // Getting the contact a second time should cache the color.
    let contact2 = await contactManager.get("id6@example.com");

    assert.equal(contact2.color, contact.color);
    assert.equal(spy.mock.calls.length, 1);
  });

  it("should return a contact with address book and identity data", async () => {
    let contact = await contactManager.get("id4@example.com");

    assert.equal(contact.contactId, "15263748");
    assert.equal(contact.identityId, "id4");
    assert.equal(contact.contactName, "id4 card");
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);
  });

  it("should only apply identity data to the matching email in the address book", async () => {
    let contact = await contactManager.get("id5@example.com");

    assert.equal(contact.contactId, "15263748");
    assert.equal(contact.identityId, "id5");
    assert.equal(contact.contactName, "id5 card");
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    // Get it again from the cache.
    contact = await contactManager.get("id5@example.com");

    assert.equal(contact.contactId, "15263748");
    assert.equal(contact.identityId, "id5");
    assert.equal(contact.contactName, "id5 card");
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);

    contact = await contactManager.get("id5second@example.com");

    assert.equal(contact.contactId, "15263748");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "id5 card");
    assert.equal(contact.photoURI, undefined);
    assert.equal(isValidColor(contact.color), true);
    assert.equal(spy.mock.calls.length, 1);
  });

  it("should update when a new contact is added", async () => {
    let contact = await contactManager.get("invalid@example.com");

    assert.equal(contact.contactId, undefined);
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, undefined);
    assert.equal(contact.photoURI, undefined);

    let listener = onCreatedSpy.mock.calls[0].arguments[0];
    listener({
      properties: {
        PrimaryEmail: "invalid@example.com",
      },
    });

    spy.mock.mockImplementation(() => [
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

    assert.equal(contact.contactId, "14327658");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "invalid name");
    assert.equal(contact.photoURI, undefined);
  });

  it("should update when a contact is updated", async () => {
    let contact = await contactManager.get("foo@example.com");

    assert.equal(contact.contactId, "135246");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "display name");
    assert.equal(contact.photoURI, undefined);

    let listener = onUpdatedSpy.mock.calls[0].arguments[0];
    listener({
      properties: {
        PrimaryEmail: "foo@example.com",
      },
    });

    spy.mock.mockImplementation(() => [
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

    assert.equal(contact.contactId, "135246");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "updated name");
    assert.equal(contact.photoURI, undefined);
  });

  it("should update when a new contact is deleted", async () => {
    let contact = await contactManager.get("foo@example.com");

    assert.equal(contact.contactId, "135246");
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, "display name");
    assert.equal(contact.photoURI, undefined);

    let listener = onDeletedSpy.mock.calls[0].arguments[0];
    listener("1", "135246");

    spy.mock.mockImplementation(() => []);

    contact = await contactManager.get("foo@example.com");

    assert.equal(contact.contactId, undefined);
    assert.equal(contact.identityId, undefined);
    assert.equal(contact.contactName, undefined);
    assert.equal(contact.photoURI, undefined);
  });

  it("should limit the size of the cache", async () => {
    contactManager.HARD_MAX_CACHE_SIZE = 10;
    contactManager.CACHE_CLEANUP_AMOUNT = 5;
    for (let i = 0; i < 10; i++) {
      await contactManager.get(`${i}@example.com`);
    }

    assert.equal(contactManager._cache.size, 10);

    // Access a couple of the older addresses.
    await contactManager.get("1@example.com");
    await contactManager.get("3@example.com");
    // And access one more to trigger the reduction.
    await contactManager.get("10@example.com");

    // Let the reduction run.
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(contactManager._cache.size, 5);

    assert.deepEqual(Array.from(contactManager._cache.keys()), [
      "1@example.com",
      "3@example.com",
      "8@example.com",
      "9@example.com",
      "10@example.com",
    ]);
  });
});
