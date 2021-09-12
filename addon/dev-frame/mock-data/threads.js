/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mockEmails, mockSelfEmail } from "./emails.js";
import { mockMessages } from "./messages.js";

// We are going to be mutating these objects as we use them,
// so make copies.
const availableEmails = [...mockEmails];
const availableMessages = [...mockMessages];

const mockThreads = [];

function getRecipients(message) {
  return [].concat(message.to || [], message.cc || [], message.bcc || [], [
    message.from,
  ]);
}

function cyclicPic(list, index) {
  return list[index % list.length];
}

function populateRequiredFields(message, includeOpenPgpTags = false) {
  message.attachments = [];
  message.detailsShowing = false;
  message.expanded = false;
  message.recipientsIncludeLists = false;
  message.tags = [];
  if (includeOpenPgpTags) {
    message.specialTags = [
      {
        // canClick: true,
        classNames: "enigmail-signed",
        icon: "material-icons.svg#edit",
        name: "Signed!",
        details: {
          type: "enigmail",
          detail: "viewSecurityInfo",
          displayInfo: {
            signatureLabel: "Signature Label",
            signatureExplanation: "This signature was / was not very good.",
            signatureKeyIdLabel: "Key id: 0x00000000",
            encryptionLabel: "Encryption Label",
            encryptionExplanation: "This encryption was / was not very good.",
            encryptionKeyIdLabel: "Enc id: 0x00000000",
            otherKeysLabel:
              "The message was encrypted to the owners of the following keys:",
            otherKeys: [
              {
                name: "Me <me@example.com>",
                id: "0x1234567890123455 (0x123456789012345)",
              },
            ],
          },
        },
        title: "Definitely Signed!",
        type: "openPgpSigned",
      },
    ];
  }
  message.hasRemoteContent = false;
  message.smimeReload = false;
  message.realFrom = message.from?.email;
  message.isPhishing = false;
  message.isOutbox = false;
  message.isJunk = false;
  message.folder = {
    accountId: "account1",
  };
}

/**
 * Populate a message's to/cc/bcc fields. `mockSelfEmail` is always
 * the first email in the `to` field.
 *
 * @param {object} message
 * @param {object} root0
 * @param {number} root0.to
 * @param {number} root0.cc
 * @param {number} root0.bcc
 */
function populateEmailFields(message, { to, cc, bcc }) {
  message.to = [mockSelfEmail];
  if (to > 1) {
    for (let i = 1; i < to; i++) {
      message.to.push(availableEmails.pop());
    }
  }
  message.cc = [];
  if (cc > 1) {
    for (let i = 1; i < cc; i++) {
      message.cc.push(availableEmails.pop());
    }
  }
  message.bcc = [];
  if (bcc > 1) {
    for (let i = 1; i < bcc; i++) {
      message.bcc.push(availableEmails.pop());
    }
  }

  message.multipleRecipients = false;
  if (getRecipients(message).length > 1) {
    message.multipleRecipients = true;
  }
}

function populateAttachmentFields(message, numAttachments) {
  message.attachments = [];
  const contentTypes = ["text/plain", "application/pdf", "image/png"];
  for (let i = 0; i < numAttachments; i++) {
    message.attachments.push({
      size: (i + 1) * 1024,
      contentType: contentTypes[i % numAttachments],
      formattedSize: `${(i + 1) * 1024}KB`,
      name: `attachment ${i}`,
      partName: `part1.${i + 1}`,
      url: `../icon.png`,
      anchor: "msgatt" + i,
    });
  }
  message.attachmentsPlural =
    numAttachments == 1 ? "1 attachment" : `${numAttachments} attachments`;
}

// Create threads of various lengths. When we create threads,
// we insert to and from, etc. information into them.
const THREAD_INFO = [
  {
    // How many messages in the thread
    length: 1,
    // How many recipients (for each thread)
    to: [1],
    cc: [0],
    bcc: [0],
    // If fake attachments are required
    attachments: [1],
  },
  {
    length: 4,
    to: [3, 3, 3, 3],
    cc: [2, 1, 5, 6],
    bcc: [2, 1, 2, 2],
    attachments: [0, 0, 0, 3],
  },
];

for (const info of THREAD_INFO) {
  const thread = [];
  // We always assume we're going to have at least one message in the thread.
  const rootMessage = { ...availableMessages.pop() };
  rootMessage.from = availableEmails.pop();
  populateRequiredFields(rootMessage);
  populateEmailFields(rootMessage, {
    to: info.to[0],
    cc: info.cc[0],
    bcc: info.bcc[0],
  });
  populateAttachmentFields(rootMessage, info.attachments[0]);
  rootMessage.initialPosition = 0;
  thread.push(rootMessage);

  const recipients = getRecipients(rootMessage);

  // Add the rest of the messages in the thread
  for (let i = 1; i < info.length; i++) {
    const newMessage = { ...availableMessages.pop() };
    // Pick `from` to be from the recipients in the original email.
    newMessage.from = cyclicPic(recipients, i);
    populateRequiredFields(newMessage, i == info.length - 1);
    // Make the subject a never-ending chain of `Re: ...`
    newMessage.subject = "Re: " + thread[thread.length - 1].subject;
    populateEmailFields(newMessage, {
      to: info.to[i],
      cc: info.cc[i],
      bcc: info.bcc[i],
    });
    populateAttachmentFields(newMessage, info.attachments[i]);
    newMessage.initialPosition = i;
    thread.push(newMessage);
  }

  mockThreads.push(thread);
}

export { mockThreads };
