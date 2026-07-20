/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Adds or removes an individual tag by the index.
 *
 * @param {object} options
 * @param {number} options.msgId
 * @param {number} options.index
 * @param {object} options.tags
 */
export async function toggleTagByIndex({ msgId, index, tags }) {
  let allTags = await browser.messages.tags.list();

  // browser.messages.update works via arrays of tag keys only,
  // so strip away all non-key information
  tags = tags.map((t) => t.key);
  const toggledTag = allTags[index].key;

  // Toggling a tag that is out of range does nothing.
  if (!toggledTag) {
    return;
  }
  if (tags.includes(toggledTag)) {
    tags = tags.filter((t) => t !== toggledTag);
  } else {
    tags.push(toggledTag);
  }

  await browser.messages.update(msgId, { tags });
}

/**
 * Set the tags of the message to the specified list.
 *
 * @param {number} msgId
 * @param {string[]} tags
 */
export async function setTags(msgId, tags) {
  await browser.messages.update(msgId, { tags });
}
