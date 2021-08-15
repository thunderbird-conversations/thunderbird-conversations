/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from "react";
import * as ReactRedux from "react-redux";
import { ComposeWidget } from "../compose/composeWidget.jsx";
import { quickReplyActions } from "../../reducer/reducer-quickReply.js";
import { SvgIcon } from "../svgIcon.jsx";
import PropTypes from "prop-types";

export function QuickReply({ id }) {
  // Not ready to enable yet.
  if (true) {
    return (
      <div className="quickReply disabled" dir="ltr">
        <small>
          <i>
            Quick Reply is temporarily disabled due to needing rewriting for
            Thunderbird 78+.
          </i>
        </small>
      </div>
    );
  }

  const dispatch = ReactRedux.useDispatch();
  const { quickReplyState } = ReactRedux.useSelector((state) => ({
    quickReplyState: state.quickReply,
  }));

  function expand() {
    return dispatch(quickReplyActions.expand({ id }));
  }
  function discard() {
    return dispatch(quickReplyActions.discard());
  }

  if (quickReplyState.expanded) {
    return (
      <div className="quickReply">
        <div>
          <ComposeWidget dispatch={dispatch} discard={discard} />
        </div>
      </div>
    );
  }

  return (
    <div className="quickReply">
      <div className="quickReplyIcon">
        <span>Reply</span>
        <SvgIcon hash="reply" />
      </div>
      <textarea className="body collapsed" onClick={expand} />
    </div>
  );
}
QuickReply.propTypes = {
  id: PropTypes.number.isRequired,
};

// These are the templates originally from stub.html for quickReply. Moved here
// to help tidy that up and prepare.
// The quick reply goes after the messaeFooter - if it is the last message
// in the list.
/*
 <!-- This should be in the quickReply if above -->
 <!-- {{tmpl "quickReply" this}} -->
 <script id="quickReplyTemplate" type="text/x-handlebars-template"><![CDATA[
   <div class="quickReply" ondragover="quickReplyCheckDrag(event);" ondrop="quickReplyDrop(event);">
     <div class="quickReplyContacts">
       <div class="quickReplyContactsHeader">
         {{str "mostFrequentContacts"}}
       </div>
       <div class="quickReplyContactsBox">
       </div>
       <div class="quickReplyContactsMore">
         <a class="quickReplyContactsMoreLink">
           {{str "showMore"}}
         </a>
       </div>
     </div>
     <div class="quickReplyBox">
       <div class="replyHeader">
         <div class="quickReplyRecipients">
           <ul class="fromField">
             {{str "fieldFrom"}}
             <li class="senderSwitcher"><a class="switchLeft" onclick="gComposeSession.cycleSender(-1)">◂</a> <a class="switchRight" onclick="gComposeSession.cycleSender(1)">▸</a></li>
             <li class="senderName"></li>,
             <li class="replyMethod">
               <input type="radio" name="reply-method" value="reply"
                 onchange="changeComposeFields('reply')" id="reply-radio"
               /><label for="reply-radio">{{str "reply"}}</label>
             </li>
             <li class="replyMethod replyMethod-replyAll">
               <input type="radio" name="reply-method" value="replyAll"
                 onchange="changeComposeFields('replyAll')" id="replyAll-radio"
               /><label for="replyAll-radio">{{str "replyAll"}}</label>
             </li>
             <li class="replyMethod replyMethod-replyList">
               <input type="radio" name="reply-method" value="replyList"
                 onchange="changeComposeFields('replyList')" id="replyList-radio"
               /><label for="replyList-radio">{{str "replyList"}}</label>
             </li>
             <li class="replyMethod">
               <input type="radio" name="reply-method" value="forward"
                 onchange="changeComposeFields('forward')" id="forward-radio"
               /><label for="forward-radio">{{str "forward"}}</label>
             </li>
             <li class="firstBar">|</li>
             <li class="showCc"><a onclick="showCc(); editFields('cc');" href="javascript:">{{str "addCc"}}</a> |</li>
             <li class="showBcc"><a onclick="showBcc(); editFields('bcc');" href="javascript:">{{str "addBcc"}}</a> |</li>
             <li class="addAttachment"><a onclick="addAttachment();" href="javascript:">{{str "addAttachment"}}</a></li>
           </ul>
           <div class="editRecipientList editToList">
             <div class="label">{{str "fieldTo"}}</div>
             <div class="editInput"><input type="text" id="to" /></div>
           </div>
           <div class="editRecipientList editCcList" style="display: none">
             <div class="label">{{str "fieldCc"}}</div>
             <div class="editInput"><input type="text" id="cc" /></div>
           </div>
           <div class="editRecipientList editBccList" style="display: none">
             <div class="label">{{str "fieldBcc"}}</div>
             <div class="editInput"><input type="text" id="bcc" /></div>
           </div>
           <div class="editRecipientList editSubject" style="display: none">
             <div class="label">{{str "fieldSubject"}}</div>
             <div class="editInput"><input type="text" id="subject" /></div>
           </div>
           <ul class="recipientList toList">
             {{str "fieldTo"}}
             <li>{{str "pleaseWait"}}</li>
             <li class="add-more">&#xa0;- <a href="javascript:" onclick="editFields('to');">{{str "compose.editField}}</a></li>
           </ul>
           <ul class="recipientList ccList" style="display: none;">
             {{str "fieldCc"}}
             <li>{{str "pleaseWait"}}</li>
             <li class="add-more">&#xa0;- <a href="javascript:" onclick="editFields('cc');">{{str "compose.editField"}}</a></li>
           </ul>
           <ul class="recipientList bccList" style="display: none;">
             {{str "fieldBcc"}}
             <li>{{str "pleaseWait"}}</li>
             <li class="add-more">&#xa0;- <a href="javascript:" onclick="editFields('bcc');">{{str "compose.editField"}}</a></li>
           </ul>
         </div>
         <ul class="enigmail" style="display: none;">
           <li class="replyEncrypt">
             <input type="checkbox" name="enigmail-reply-encrypt" id="enigmail-reply-encrypt"
             /><label for="enigmail-reply-encrypt">{{str "encrypt"}}</label>
           </li>
           <li class="replySign">
             <input type="checkbox" name="enigmail-reply-sign" id="enigmail-reply-sign"
             /><label for="enigmail-reply-sign">{{str "sign"}}</label>
           </li>
           <li class="replyPgpMime">
             <input type="checkbox" name="enigmail-reply-pgpmime" id="enigmail-reply-pgpmime"
             /><label for="enigmail-reply-pgpmime">PGP/MIME</label>
           </li>
         </ul>
         <div class="quickReplyAttachments">
         </div>
         <div class="quickReplyHeader" style="display: none; overflow: auto">
           <span class="statusMessage" style="float: left;"></span>
           <span class="statusPercentage" style="float: right;"></span>
           <span class="statusThrobber" style="float: right;">
             <span class="loader" style="vertical-align: middle;"></span>
           </span>
         </div>
       </div>

       <ul class="inputs">
         <li class="reply expand" ondragenter="quickReplyDragEnter(event);">
           <div class="textWrap">
             <div class="quickReplyIcon"><span>{{str "reply"}}</span> <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="material-icons.svg#reply"></use></svg></div>
             <iframe mozframetype="content" class="textarea sans"></iframe>
           </div>
         </li>

         <li class="replyAll expand" ondragenter="quickReplyDragEnter(event);">
           <div class="textWrap">
             <div class="quickReplyIcon"><span>{{str "replyAll"}}</span> <svg class="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="material-icons.svg#reply_all"></use></svg></div>
             <iframe mozframetype="content" class="textarea sans"></iframe>
           </div>
         </li>
       </ul>

       <div class="replyFooter" style="overflow: auto" tabindex="-1">
         <button id="send" style="float:right;margin-left:3px;" onclick="gComposeSession.send();">
           {{str "send"}}
         </button>
         <button id="sendArchive" style="float:right;margin-left:3px;"
             onclick="gComposeSession.send({ archive: true });">
           {{str "sendArchive"}}
         </button>
         <button id="save" style="float:right" onclick="onSave();">{{str "save"}}</button>
         <a class="discard" href="javascript:" id="discard"
           onclick="confirmDiscard()">{{str "discard"}}</a>
       </div>
     </div>
   </div>
   ]]>
 </script>
 <script id="quickReplyAttachmentTemplate" type="text/x-handlebars-template"><![CDATA[
   <ul class="quickReplyAttachment">
     {{str "attachment"}}:
     <li>{{name}}</li> ({{size}}) -
     <a href="javascript:" class="openAttachmentLink">{{str "open"}}</a> -
     <a href="javascript:" class="removeAttachmentLink">{{str "removeAttachment"}}</a>
   </ul>
   ]]>
 </script>
*/

// Old Message.js event handlers:
//
// this.register(".quickReply", function(event) {
//   event.stopPropagation();
// }, { action: "keyup" });
// this.register(".quickReply", function(event) {
//   event.stopPropagation();
// }, { action: "keypress" });
// this.register(".quickReply", function(event) {
//   // Ok, so it's actually convenient to register our event listener on the
//   //  .quickReply node because we can easily prevent it from bubbling
//   //  upwards, but the problem is, if a message is appended at the end of
//   //  the conversation view, this event listener is active and the one from
//   //  the new message is active too. So we check that the quick reply still
//   //  is inside our dom node.
//   if (!self._domNode.getElementsByClassName("quickReply").length)
//     return;
//
//   let window = self._conversation._htmlPane;
//
//   switch (event.keyCode) {
//     case mainWindow.KeyEvent.DOM_VK_RETURN:
//       if (isAccel(event)) {
//         if (event.shiftKey)
//           window.gComposeSession.send({ archive: true });
//         else
//           window.gComposeSession.send();
//       }
//       break;
//
//     case mainWindow.KeyEvent.DOM_VK_ESCAPE:
//       Log.debug("Escape from quickReply");
//       self._domNode.focus();
//       break;
//   }
//   event.stopPropagation();
// }, { action: "keydown" });
