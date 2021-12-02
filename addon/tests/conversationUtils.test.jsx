/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createFakeData } from "./utils.js";
import { jest } from "@jest/globals";
import { browser } from "../content/es-modules/thunderbird-compat.js";
import { conversationUtils } from "../content/reducer/conversationUtils.js";

describe("conversationUtils", () => {
  let composeSpy;

  beforeEach(() => {
    composeSpy = jest.spyOn(browser.compose, "beginNew");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("forward", () => {
    test("Fills out the message with details from the header", async () => {
      let now = new Date();
      let fullDate = new Intl.DateTimeFormat(undefined, {
        timeStyle: "long",
      }).format(now);
      let msg = createFakeData(
        {
          from: {
            avatar: "avatar.jpg",
            colorStyle: {
              backgroundColor: "green",
            },
            email: "me@example.com",
            name: "foo",
          },
        },
        new Map(),
        true
      );
      msg.fullDate = fullDate;

      await conversationUtils.forward(0, [msg]);

      expect(composeSpy).toHaveBeenCalled();
      expect(composeSpy.mock.calls[0][0]).toStrictEqual({
        body: `<html><body><p>Here\'s a conversation I thought you might find interesting!</p><div style="border-top: 1px solid #888; height: 15px; width: 70%; margin: 0 auto; margin-top: 15px">&nbsp;</div><div style="font-family: sans-serif !important;"><div style="overflow: auto"><img src="avatar.jpg" style="float: left; height: 48px; margin-right: 5px" /><b><span><a style="color: green !important; text-decoration: none !important; font-weight: bold" href="mailto:me@example.com">foo</a></span></b><br /><span style="color: #666">${fullDate}</span></div><div style="color: #666"><br>MsgBody</div></div>`,
        identityId: "idac34",
        isPlainText: false,
      });
    });
  });
});
