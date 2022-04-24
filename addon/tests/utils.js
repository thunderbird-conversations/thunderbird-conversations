/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function createFakeData(
  {
    id = 0,
    headerMessageId = null,
    attachments = [],
    author = null,
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
    type = "normal",
  } = {},
  fakeMessageHeaderData,
  postProcessing = false
) {
  let data = {
    attachments,
    date,
    // Set the headerMessageId to avoid filtering out duplicates due to no id.
    headerMessageId: headerMessageId ?? id,
    flagged,
    folder: {
      accountId: "id1",
      type: folderType,
      name: folderName,
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

  fakeMessageHeaderData.set(id, {
    date,
    flagged,
    folder: {
      accountId: "id1",
      type: folderType,
      name: folderName,
    },
    junk,
    read,
    subject,
    tags,
  });

  return data;
}

export function createFakeSummaryData(prefs = {}) {
  return {
    prefs: {
      noFriendlyDate: false,
      expandWho: 4,
      ...prefs,
    },
  };
}
