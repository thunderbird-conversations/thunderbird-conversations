/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export let conversationUtils = new (class {
  async forward(tabId, msgs) {
    let body = await this._exportConversationAsHtml(msgs);
    let displayedMsgs =
      await browser.messageDisplay.getDisplayedMessages(tabId);
    let identityId = undefined;
    if (displayedMsgs.length) {
      let accountId = displayedMsgs[0].folder.accountId;
      let account = await browser.accounts.get(accountId);
      identityId = account.identities[0]?.id;
    }
    await browser.compose.beginNew({
      identityId,
      isPlainText: false,
      body,
    });
  }

  async _exportConversationAsHtml(msgs) {
    let hr =
      '<div style="border-top: 1px solid #888; height: 15px; width: 70%; margin: 0 auto; margin-top: 15px">&nbsp;</div>';
    let html =
      "<html><body>" +
      "<p>" +
      browser.i18n.getMessage("conversation.forwardFillInText") +
      "</p>" +
      hr;
    let promises = [];
    for (const msg of msgs) {
      promises.push(this._exportMsgAsHtml(msg));
    }

    let messagesHtml = await Promise.all(promises);
    html +=
      '<div style="font-family: sans-serif !important;">' +
      messagesHtml.join(hr) +
      "</div>";
    return html;
  }

  /**
   * This function is called for forwarding messages as part of conversations.
   * The idea is that we want to forward a plaintext version of the message, so
   * we try and do our best to give this. We're trying not to stream it once more!
   *
   * @param {object} msg
   *   The message data to export.
   */
  async _exportMsgAsHtml(msg) {
    // We try to convert the bodies to plain text, to enhance the readability in
    // the forwarded conversation. Note: <pre> tags are not converted properly
    // it seems, need to investigate...
    let body = await browser.conversations.quoteMsgHdr(msg.id);

    // UGLY HACK. I don't even wanna dig into the internals of the composition
    // window to figure out why this results in an extra <br> being added, so
    // let's just stay sane and use a hack.
    body = body.replace(/\r?\n<br>/g, "<br>");
    body = body.replace(/<br>\r?\n/g, "<br>");
    if (!(body.indexOf("<pre wrap>") === 0)) {
      body = "<br>" + body;
    }
    return ['<div style="overflow: auto">']
      .concat(
        msg.from
          ? [
              '<img src="',
              msg.from.avatar,
              '" style="float: left; height: 48px; margin-right: 5px" />',
              '<b><span><a style="color: ',
              msg.from.colorStyle.backgroundColor,
              ' !important; text-decoration: none !important; font-weight: bold" href="mailto:',
              msg.from.email,
              '">',
              this._escapeHtml(msg.from.name),
              "</a></span></b><br />",
            ]
          : [],
        [
          '<span style="color: #666">',
          msg.fullDate,
          "</span>",
          "</div>",
          '<div style="color: #666">',
          body,
          "</div>",
        ]
      )
      .join("");
  }

  /**
   * Helper function to escape some XML chars, so they display properly in
   *  innerHTML.
   *
   * @param {string} html
   *   input text
   * @returns {string}
   *   The string with &lt;, &gt;, and &amp; replaced by the corresponding entities.
   */
  _escapeHtml(html) {
    html += "";
    // stolen from selectionsummaries.js (thanks davida!)
    return html.replace(/[<>&]/g, function (s) {
      switch (s) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        default:
          throw Error("Unexpected match");
      }
    });
  }
})();
