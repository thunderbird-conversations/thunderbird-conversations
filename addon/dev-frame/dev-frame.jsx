/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as RTK from "@reduxjs/toolkit";
import * as ReactRedux from "react-redux";
import { Message } from "../content/message.jsx";

const testSlice = RTK.createSlice({
  name: "test",
  initialState: {},
  reducers: {},
});
const store = RTK.configureStore({ reducer: testSlice.reducer });

function ExampleMessage() {
  return (
    <Message
      autoMarkAsRead={false}
      browserBackgroundColor={"white"}
      browserForegroundColor={"black"}
      defaultFontSize={11}
      dispatch={(...args) => {
        console.log("Dispatched Event:", ...args);
      }}
      displayingMultipleMsgs={false}
      iframesLoading={0}
      index={0}
      isLastMessage={false}
      hasBuiltInPdf={false}
      hideQuickReply={true}
      tenPxFactor={1}
      setRef={() => {}}
      advanceMessage={() => {}}
      prefs={{
        hideSigs: false,
        hideQuoteLength: 5,
        tweakBodies: true,
        tweakChrome: true,
      }}
      message={{
        id: 1,
        date: "12/8/20, 3:22 PM",
        folderName: "siefkenj@gmail.com/Inbox",
        hasRemoteContent: false,
        isDraft: false,
        isJunk: false,
        isOutbox: false,
        isPhishing: false,
        messageKey: 48042,
        msgUri: "imap-message://INBOX#48042",
        multipleRecipients: false,
        neckoUrl: "imap://INBOX%3E48042",
        needsLateAttachments: false,
        read: true,
        realFrom: "nobody@thunderbird.net",
        recipientsIncludeLists: false,
        smimeReload: false,
        shortFolderName: "Inbox",
        subject: "Mozilla Add-ons: Mail Merge P 2.3 Updated",
        snippet: "...",
        starred: false,
        from: {
          name: "Thunderbird Add-ons",
          initials: "TO",
          displayEmail: "nobody@thunderbird.net",
          tooltipName: "Thunderbird Add-ons",
          email: "nobody@thunderbird.net",
          avatar:
            "chrome://messenger/skin/addressbook/icons/contact-generic.svg",
          contactId: null,
          extra: "",
          colorStyle: { backgroundColor: "hsl(174, 70%, 27%)" },
          separator: "",
        },
        to: [
          {
            name: "Me",
            initials: "ME",
            displayEmail: "",
            tooltipName: "Me",
            email: "s@gmail.com",
            avatar: "file:///home/l.png",
            contactId: "86ff",
            extra: "s@gmail.com",
            colorStyle: { backgroundColor: "hsl(34, 70%, 34%)" },
          },
        ],
        cc: [],
        bcc: [],
        attachments: [],
        attachmentsPlural: " attachments",
        fullDate: "12/8/20, 3:22 PM",
        tags: [],
        inView: true,
        initialPosition: 0,
        scrollTo: false,
        expanded: true,
        detailsShowing: false,
      }}
    />
  );
}

// The entry point
export function Main() {
  return (
    <React.Fragment>
      <h2>Thunderbird Conversations Dev Frame</h2>
      <div className="three-pane-container">
        <div className="three-pane-left">
          <h4 className="faux-inbox">Inbox (200)</h4>
        </div>
        <div className="three-pane-right">
          <div className="three-pane-top">
            The dev frame renders Conversations components in the browser for
            rapid development. Some, but not all, thunderbird functions are
            mocked.
          </div>
          <div className="three-pane-bottom">
            <div id="conversationWrapper">
              <ReactRedux.Provider store={store}>
                <ExampleMessage />
              </ReactRedux.Provider>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
