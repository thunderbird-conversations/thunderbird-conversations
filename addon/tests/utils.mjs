/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";

export function createFakeData(
  {
    asInternal = false,
    id = 0,
    headerMessageId = null,
    attachments = [],
    author = null,
    bccList = [],
    ccList = [],
    date = new Date(),
    detailsShowing,
    flagged = false,
    folderType = "inbox",
    folderName = "Inbox",
    from = null,
    fullDate = "",
    getFullRequired = false,
    initialPosition = 0,
    junk = false,
    read = false,
    subject = "Fake Msg",
    snippet = "",
    tags = [],
    to = [],
    type = "normal",
  } = {},
  fakeMessageHeaderData,
  postProcessing = false
) {
  if (!Array.isArray(to)) {
    to = [to];
  }
  let data = {
    attachments,
    bcc: [],
    cc: [],
    date: asInternal ? date.toString() : date,
    // Set the headerMessageId to avoid filtering out duplicates due to no id.
    headerMessageId: headerMessageId ?? id,
    flagged,
    folder: {
      accountId: "id1",
      type: folderType,
      name: folderName,
      path: folderName,
    },
    getFullRequired,
    id,
    initialPosition,
    junk,
    read,
    recipientsIncludeLists: false,
    snippet,
    source: "gloda",
    subject,
    tags,
    to: [],
    type,
  };
  if (detailsShowing !== undefined) {
    data.detailsShowing = detailsShowing;
  }
  if (author) {
    data.author = author;
  }
  if (from) {
    data.from = from;
  }
  if (to.length) {
    data.to = [to];
  }

  fakeMessageHeaderData.set(id, {
    author,
    ccList,
    bccList,
    date,
    flagged,
    folder: {
      accountId: "id1",
      type: folderType,
      name: folderName,
      path: folderName,
    },
    junk,
    read,
    recipients: to ? to.map((t) => t.email) : [],
    subject,
    tags,
  });

  return data;
}

export function createFakeSummaryData(prefs = {}) {
  return {
    tabId: 1,
    prefs: {
      noFriendlyDate: false,
      expandWho: 4,
      ...prefs,
    },
  };
}

export function assertContains(a, b) {
  for (let [key, value] of Object.entries(b)) {
    if (typeof value == "object") {
      if (Array.isArray(value)) {
        assert.deepEqual(a[key], value, `Array should match for key: ${key}`);
      } else {
        assertContains(a[key], value);
      }
    } else if (a[key] != value) {
      assert.fail(`${key}: ${a[key]} != ${value}`);
    }
  }
}
