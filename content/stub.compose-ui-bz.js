/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Conversations
 *
 * The Initial Developer of the Original Code is
 *  Jonathan Protzenko <jonathan.protzenko@gmail.com>
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");

// Remove when switching to Thunderbird 7
if (!("cookies" in Services)) {
  XPCOMUtils.defineLazyServiceGetter(Services, "cookies",
                                     "@mozilla.org/cookiemanager;1",
                                     "nsICookieManager2");
}

let gBugzillaAPIs = {
  "https://bugzilla.mozilla.org/":
    "https://api-dev.bugzilla.mozilla.org/latest/",
  "https://landfill.bugzilla.org/bzapi_sandbox/":
    "https://api-dev.bugzilla.mozilla.org/test/latest/",
};

function addBzLink(aUrl) {
  if (gComposeSession && gComposeSession.addedBzLink)
    return;
  $(".quickReply")
    .append($("<div />")
      .css("text-align", "right")
      .css("padding-top", "5px")
      .append($("<a>")
        .css("color", "rgb(114, 159, 207)")
        .css("text-decoration", "underline")
        .text(strings.get("bzDoLogin"))
        .attr("href", "javascript:")
        .click(function () {
          topMail3Pane(window).document.getElementById("tabmail")
            .openTab("contentTab",  { contentPage: aUrl });
        })
      )
    );
  if (gComposeSession)
    gComposeSession.addedBzLink = true;
}

function bzSetup() {
  let conv = Conversations.currentConversation;
  let lastMsg = conv.messages[conv.messages.length - 1].message;
  if ("url" in lastMsg.bugzillaInfos) {
    let url = lastMsg.bugzillaInfos.url;
    if (url in gBugzillaAPIs) {
      let cookie = getBugzillaCookie(url);
      let bzUrl = gBugzillaAPIs[url];
      if (cookie) {
        document.querySelector(".quickReply li.reply .quickReplyIcon span")
          .textContent = strings.get("bzPlaceholder");
        return [url, bzUrl, cookie];
      } else {
        document.querySelector(".quickReply li.reply .quickReplyIcon span")
          .textContent = strings.get("bzNoCookieMsg");
        addBzLink(url);
        return null;
      }
    } else {
      document.querySelector(".quickReply li.reply .quickReplyIcon span")
        .textContent = strings.get("bzNoApiUrlMsg");
      return null;
    }
  } else {
    return null;
  }

}

function getBugzillaCookie(aUrl) {
  let uri = Services.io.newURI(aUrl, null, null);
  let cookies = Services.cookies.getCookiesFromHost(uri.host);
  let login = null;
  let loginCookie = null;
  for (let cookie of fixIterator(cookies, Ci.nsICookie)) {
    if (cookie.name == "Bugzilla_login")
      login = cookie.value;
    if (cookie.name == "Bugzilla_logincookie")
      loginCookie = cookie.value;
  }
  Log.debug(Colors.blue, "Bugzilla", login, loginCookie, Colors.default);
  if (login && loginCookie)
    return [login, loginCookie];
  else
    return null;
}

function BzComposeSession (match, webUrl, apiUrl, [login, loginCookie]) {
  this.webUrl = webUrl;
  // A visitor pattern.
  //  match({ reply(nsIMsgDbHdr), draft({ msgUri, from, to, cc, bcc, body }) })
  this.match = match;
  // A composition session may be setup (i.e. the fields in the UI filled with
  //  the right values), but that doesn't mean the user has edited it yet...
  this.startedEditing = false;
  // So that we don't break the rest of the UI.
  this.params = {
    identity: null,
    msgHdr: null,
  };
  this.addedBzLink = false;

  let conv = Conversations.currentConversation;
  this.message = conv.messages[conv.messages.length - 1].message;

  // This makes no sense in this context
  $(".useEditor").attr("disabled", true);
  $(".editRecipientList, .recipientList, .showCc, .showBcc").hide();
  $(".fromField").text(strings.get("bzLoggedIn", [apiUrl]));
  // Because loadDraft expects this to be JSON data...
  $("#to, #cc, #bcc").val("[]");

  this.makeQuery = function (action) {
    let queryString =
      apiUrl + action + "?userid=" + login + "&cookie=" + loginCookie;
    return queryString;
  }

  let mainWindow = topMail3Pane(window);
  let self = this;
  // Implement the required minima so that loading and saving a draft work.
  match({
    reply: function (aMessage) {
      let aMsgHdr = aMessage._msgHdr;
      let suggestedIdentity = mainWindow.getIdentityForHeader(aMsgHdr, Ci.nsIMsgCompType.ReplyAll);
      self.params.identity = suggestedIdentity || getDefaultIdentity().identity;
      self.params.msgHdr = aMsgHdr;
    },
    draft: function ({ msgUri, from, body }) {
      self.params.identity = getIdentityForEmail(from).identity || getDefaultIdentity().identity;
      self.params.msgHdr = msgUriToMsgHdr(msgUri);
      $("textarea").val(body);
    },
  });
}

const RE_BUG_NUMBER = /^bug-([\d]+)-/;

BzComposeSession.prototype = {
  send: function (options) {
    let self = this;
    let archive = options && options.archive;
    let id = Conversations.currentConversation.id;
    let conv = Conversations.currentConversation;
    let results = RE_BUG_NUMBER.exec(this.message._msgHdr.messageId);
    if (results && results.length) {
      let bugNumber = results[1];
      let url = this.makeQuery("bug/"+bugNumber+"/comment/");

      let req = new XMLHttpRequest();
      // Register a whole bunch of event listeners.
      req.addEventListener("progress", function (event) {
        if (event.lengthComputable) {
          pValue(event.loaded/event.total);
        } else {
          pUndetermined();
        }
      }, false);
      req.addEventListener("error", function (event) {
        pText(strings.get("bzMsgXHRError"));
      }, false);
      req.addEventListener("abort", function (event) {
        pText(strings.get("bzMsgXHRAbort"));
      }, false);
      // This is where the real analysis is happening...
      req.addEventListener("load", function (event) {
        pValue(100);
        let response = null;
        try {
          response = JSON.parse(req.responseText);
        } catch (e) {
          pText(strings.get("bzMsgCantParse"));
        }
        if (response) {
          if ("error" in response && response.error == "1") {
            pText(strings.get("bzMsgError", [response.code, response.message]));
            addBzLink(self.webUrl);
          } else {
            pText(strings.get("bzMsgSuccess"));
            // Only operate if we haven't changed conversations in the
            // meanwhile.
            if (id == Conversations.currentConversation.id) {
              setTimeout(function () {
                $(".quickReplyHeader").hide();
              }, 1000);
              onDiscard();
              $("textarea").val("");
              // We can do this because we're in the right if-block.
              gComposeSession = null;
              gDraftListener.notifyDraftChanged("removed");
            }
            // Remove the old stored draft, don't use onDiscard, because the
            // compose params might have changed in the meanwhile.
            if (id)
              SimpleStorage.spin(function* () {
                yield ss.remove(id);
                yield SimpleStorage.kWorkDone;
              });
            if (archive)
              msgHdrsArchive(conv.msgHdrs.filter(x => !msgHdrIsArchive(x)));
          }
        }
      }, false);
      // Now we're about to send.
      Log.debug("Sending a bugzilla comment to", url);
      pText(strings.get("bzMsgStartSending"));
      $(".quickReplyHeader").show();
      req.open("POST", url);
      req.setRequestHeader('Accept', 'application/json');
      req.setRequestHeader('Content-Type', 'application/json');
      req.send(JSON.stringify({
        text: htmlToPlainText(getActiveEditor().value)
      }));
    } else {
      pText(strings.get("bzRegexpFail"));
    }
  },
};
