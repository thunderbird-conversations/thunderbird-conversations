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

/* globals React, ReactDOM, Conversations, MailServices, printConversation */
/* exported ConversationFooter */

ChromeUtils.import("resource:///modules/StringBundle.js"); // for StringBundle

class ConversationFooter extends React.Component {
  constructor() {
    super();
    this.strings = new StringBundle("chrome://conversations/locale/pages.properties");
  }
  forwardConversation(event) {
    let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                    .createInstance(Ci.nsIMsgCompFields);
    fields.characterSet = "UTF-8";
    fields.bodyIsAsciiOnly = false;
    fields.forcePlainText = false;
    Conversations.currentConversation.exportAsHtml(function(html) {
      fields.body = html;
      let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                      .createInstance(Ci.nsIMsgComposeParams);
      params.format = Ci.nsIMsgCompFormat.HTML;
      params.composeFields = fields;
      return MailServices.compose.OpenComposeWindowWithParams(null, params);
    });
  }

  render() {
    return (
      <div className="bottom-links">
        <a className="link"
           href="javascript:"
           onClick={this.forwardConversation}>
          {this.strings.get("stub.forward.tooltip")}
        </a> – <a className="link"
           href="javascript:"
           onClick={printConversation}>
           {this.strings.get("stub.print.tooltip")}
        </a>
      </div>
    );
  }
}
