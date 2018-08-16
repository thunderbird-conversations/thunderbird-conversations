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

/* exported hideQuickReply, registerQuickReplyEventListeners,
            registerQuickReplyDocumentCommands */

function makeEditable(aIframe, aMakeEditable) {
  // Setup the iframe to be editable in htmlmail mode (for blockquotes)
  let w = aIframe.contentWindow;
  // let nav = w.QueryInterface(Ci.nsIInterfaceRequestor)
  //             .getInterface(Ci.nsIWebNavigation);
  let s = w.QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIWebNavigation)
           .QueryInterface(Ci.nsIInterfaceRequestor)
           .getInterface(Ci.nsIEditingSession);
  if (aMakeEditable) {
    // aIframe.designMode = "on";
    s.makeWindowEditable(w, "htmlmail", false, true, false);
  } else {
    // s.detachFromWindow(w);
    s.tearDownEditorOnWindow(w);
  }
}

function showQuickReply() {
  $(this).parent().addClass('noPad');
  $(this).addClass('selected');
  $(this).siblings().addClass('invisible');
  $(this).closest('.messageFooter').find('.footerActions').hide();
  if (isQuickCompose)
    $('.replyHeader, .replyFooter').show();
  else
    setTimeout(function() {
      $('.replyHeader, .replyFooter').slideDown();
    }, 500);

  var textarea = $(this).find('.textarea');
  makeEditable(textarea.get(0), true);
  textarea.addClass('ease selected');
  let delay = isQuickCompose ? 0 : 900;
  setTimeout(function() {
    textarea.removeClass('ease');
    scrollNodeIntoView(document.querySelector(".quickReply"));
  }, delay);
}

function hideQuickReply() {
  $('.replyHeader, .replyFooter').slideUp();
  setTimeout(function() {
    $('ul.inputs').removeClass('noPad');
    $('ul.inputs li').removeClass('selected');
    $('ul.inputs li').removeClass('invisible');
    $('.quickReply').closest('.messageFooter').find('.footerActions').show();

    var textarea = $('.textarea.selected');
    makeEditable(textarea.get(0), false);
    textarea.addClass('ease');
    textarea.removeClass('selected');
    textarea.removeAttr('style');
    setTimeout(function() {
      textarea.removeClass('ease');
    }, 500);
  }, 500);
}

function registerQuickReplyEventListeners() {

  $('ul.inputs li.expand').click(function(event) {
    if ($(this).hasClass("selected"))
      return;
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

  // Autoresize sorta-thingy.
  let textarea = document.querySelector(".textarea");
  let lineHeight = parseInt(
    window.getComputedStyle(textarea, null).lineHeight
  );
  let getHeight = x => parseInt(window.getComputedStyle(x, null).height);
  $('.quickReply .textarea').keypress(function(event) {
    if (event.which == KeyEvent.DOM_VK_RETURN) {
      let scrollHeight = textarea.contentDocument.body.scrollHeight;
      // Only grow if the contents of the reply don't fit into the viewport.
      Log.debug(scrollHeight, getHeight(textarea));
      if (scrollHeight > getHeight(textarea)) {
        // The resulting height if we do perform the resizing (12px is for the
        // margins).
        let totalTargetHeight = getHeight(textarea) + 12 + lineHeight;
        // The total available vertical height (44px is for the top header, 5px
        // is for good measure)
        let availableHeight = window.innerHeight - 49;
        Log.debug(totalTargetHeight, lineHeight, availableHeight);
        // We only grow the textarea if it doesn't exceed half of the available
        // vertical height.
        if (totalTargetHeight <= availableHeight/2) {
          Log.debug("Growing to", (getHeight(textarea)+lineHeight)+"px");
          textarea.style.height = (getHeight(textarea)+lineHeight)+"px";

          // Scroll if we grew the reply area into overflow
          let pageTop = window.pageYOffset;
          let pageBottom = pageTop + window.innerHeight;
          let textareaBottom = $(".textarea").offset().top + $(".textarea").outerHeight();
          // 20px for good measure...
          let diff = pageBottom - textareaBottom - 20;
          Log.debug(pageBottom, textareaBottom, diff);
          if (diff < 0)
            window.scrollTo(0, pageTop - diff);
        }
      }
      Log.debug("---");
    }
  });
}

function registerQuickReplyDocumentCommands() {
  for (let iframe of document.querySelectorAll(".textarea")) {
    let w = iframe.contentWindow;
    let doc = iframe.contentDocument;
    w.addEventListener("keypress", function(event) {
      if (isAccel(event) && event.which == 'b'.charCodeAt(0))
        doc.execCommand("bold");
      if (isAccel(event) && event.which == 'i'.charCodeAt(0))
        doc.execCommand("italic");
      if (isAccel(event) && event.which == 'u'.charCodeAt(0))
        doc.execCommand("underline");
    });
  }
}
