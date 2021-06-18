/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Walk through each message in `msgData`, fetch and extend details about
 * each message. When the details are fetched, merge them into the
 * message object itself.
 *
 * @param {object[]} msgData
 *   The message details
 */
export async function enrichMessageData(msgData) {
  for (const message of msgData) {
    adjustSnippetForBugzilla(message);
  }
}

const RE_BZ_BUG_LINK = /^https:\/\/.*?\/show_bug.cgi\?id=[0-9]*/;
const RE_BZ_COMMENT = /^--- Comment #\d+ from .* \d{4}.*? ---([\s\S]*)/m;

function adjustSnippetForBugzilla(message) {
  if (!message.type == "bugzilla") {
    return;
  }

  let snippet = message.snippet;

  let m = snippet.match(RE_BZ_BUG_LINK);
  if (m?.[0]) {
    snippet = snippet.substring(m[0].trim().length);
  }
  m = snippet.match(RE_BZ_COMMENT);
  if (m?.length && m[1].trim().length) {
    snippet = m[1];
  }

  message.snippet = snippet;
}
