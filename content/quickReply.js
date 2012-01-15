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
 * Portions created by the Initial Developer are Copyright (C) 2011
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

function showQuickReply() {
  $(this).parent().addClass('noPad');
  $(this).addClass('selected');
  $(this).siblings().addClass('invisible');
  setTimeout(function() {
    $('.replyHeader, .replyFooter').slideDown();
  }, 500);
  
  var textareas = $(this).find('textarea');
  textareas.addClass('ease selected');
  setTimeout(function() {
    textareas.removeClass('ease');
    scrollNodeIntoView(document.querySelector(".quickReply"));
  }, 900);
}

function hideQuickReply() {
  $('.replyHeader, .replyFooter').slideUp();
  setTimeout(function() {
    $('ul.inputs').removeClass('noPad');
    $('ul.inputs li').removeClass('selected');
    $('ul.inputs li').removeClass('invisible');
    
    var textareas = $('ul.inputs li textarea.selected');
    textareas.addClass('ease');
    textareas.removeClass('selected');
    textareas.removeAttr('style');
    setTimeout(function() {
      textareas.removeClass('ease');
    }, 500);
  }, 500);
}

function registerQuickReplyEventListeners() {

  $('.popout').click(function (event) {
    let $parent = $(this).parent();
    let isSelected = $parent.hasClass("selected");
    let type;
    if ($parent.hasClass("reply"))
      type = "reply";
    else if ($parent.hasClass("replyAll"))
      type = "replyAll";
    else
      Log.assert(false, "There's only two type of textareas");
    onPopOut(event, type, isSelected);
    event.stopPropagation();
  });
  
  // Must match .quickReply li.selected textarea size in quickreply.css
  let lastKnownHeight = 0;

  $('ul.inputs li.expand').click(function(event) {
    if ($(this).hasClass("selected"))
      return;
    lastKnownHeight = 0;
    showQuickReply.call(this);
    let type;
    if ($(this).hasClass("reply"))
      type = "reply";
    else if ($(this).hasClass("replyAll"))
      type = "replyAll";
    else
      Log.assert(false, "There's only two type of textareas");
    Log.debug("New quick reply (event listener) →", type);
    newComposeSessionByClick(type);
  });
  
  $('a.discard').click(function() {
    confirmDiscard();
  });

  let lineHeight = parseInt(
    window.getComputedStyle(document.querySelector('.quickReply textarea'), null).lineHeight
  );
  // Autoresize sorta-thingy.
  $('.quickReply textarea').keypress(function (event) {
    if (event.which == KeyEvent.DOM_VK_RETURN) {
      if (event.target.scrollHeight > lastKnownHeight) {
        // 5px padding-top, 5px padding-bottom, 1px border-top-width, 1px
        // border-bottom-width
        let height = parseInt(window.getComputedStyle(event.target, null).height) + 12;
        // We don't want a quick reply area that's higher than the available
        // height! (44px is for the top header, 5px is for good measure)
        let availableHeight = window.frameElement.scrollHeight - 49;
        Log.debug(height, lineHeight, availableHeight);
        if (height + lineHeight <= availableHeight)
          height += lineHeight;
        event.target.style.height = height+"px";
        lastKnownHeight = height;
      }
    }
  });
}
