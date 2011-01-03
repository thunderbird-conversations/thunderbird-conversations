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
 * Jonathan Protzenko
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

var EXPORTED_SYMBOLS = [
  'quoteMsgHdr', 'citeString',
  'htmlToPlainText', 'simpleWrap',
  'plainTextToHtml',
]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource://gre/modules/NetUtil.jsm");

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Compose");

/**
 * Use the mailnews component to stream a message, and process it in a way
 *  that's suitable for quoting (strip signature, remove images, stuff like
 *  that).
 * @param {nsIMsgDBHdr} The message header that you want to quote
 * @param {Function} k The continuation. This function will be passed quoted
 *  text suitable for insertion in a plaintext editor. The text must be appended
 *  to the mail body "as is", it shouldn't be run again through htmlToPlainText
 *  or whatever.
 * @return
 */
function quoteMsgHdr(aMsgHdr, k) {
  let chunks = [];
  let listener = {
    setMimeHeaders: function () {
    },

    onStartRequest: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext) {
    },

    onStopRequest: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext, /* int */ aStatusCode) {
      let data = chunks.join("");
      k(htmlToPlainText(data));
    },

    onDataAvailable: function (/* nsIRequest */ aRequest, /* nsISupports */ aContext,
        /* nsIInputStream */ aStream, /* int */ aOffset, /* int */ aCount) {
      // Fortunately, we have in Gecko 2.0 a nice wrapper
      let data = NetUtil.readInputStreamToString(aStream, aCount);
      // Now each character of the string is actually to be understood as a byte
      //  of a UTF-8 string.
      // Everyone knows that nsICharsetConverterManager and nsIUnicodeDecoder
      //  are not to be used from scriptable code, right? And the error you'll
      //  get if you try to do so is really meaningful, and that you'll have no
      //  trouble figuring out where the error comes from...
      let unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                             .createInstance(Ci.nsIScriptableUnicodeConverter);
      unicodeConverter.charset = "UTF-8";
      // So charCodeAt is what we want here...
      let array = [];
      for (let i = 0; i < data.length; ++i)
        array[i] = data.charCodeAt(i);
      // Yay, good to go!
      chunks.push(unicodeConverter.convertFromByteArray(array, array.length));
    },

    QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsIStreamListener,
      Ci.nsIMsgQuotingOutputStreamListener, Ci.nsIRequestObserver])
  };
  // Here's what we want to stream...
  let msgUri = uri(aMsgHdr);
  Log.debug("Streaming", msgUri);
  /**
   * Quote a particular message specified by its URI.
   *
   * @param charset optional parameter - if set, force the message to be
   *                quoted using this particular charset
   */
  //   void quoteMessage(in string msgURI, in boolean quoteHeaders,
  //                     in nsIMsgQuotingOutputStreamListener streamListener,
  //                     in string charset, in boolean headersOnly);
  let quoter = Cc["@mozilla.org/messengercompose/quoting;1"]
               .createInstance(Ci.nsIMsgQuote);
  quoter.quoteMessage(msgUri, false, listener, "", false);
}

/**
 * A function that properly quotes a plaintext email.
 * @param {String} aStr The mail body that we're expected to quote.
 * @return {String} The quoted mail body with >'s properly taken care of.
 */
function citeString(aStr) {
  let l = aStr.length;
  return aStr.replace("\n", function (match, offset, str) {
    // http://mxr.mozilla.org/comm-central/source/mozilla/editor/libeditor/text/nsInternetCiter.cpp#96
    if (offset < l) {
      if (str[offset+1] != ">")
        return "\n> ";
      else
        return "\n>";
    }
  }, "g");
}

/**
 * Wrap some text. Beware, that function doesn't do rewrapping, and only
 *  operates on non-quoted lines. This is only useful in our very specific case
 *  where the quoted lines have been properly wrapped for format=flowed already,
 *  and the non-quoted lines are the only ones that need wrapping for
 *  format=flowed.
 * Beware, this function will treat all lines starting with >'s as quotations,
 *  even user-inserted ones. We would need support from the editor to proceed
 *  otherwise, and the current textarea doesn't provide this.
 * This function, when breaking lines, will do space-stuffing per the RFC if
 *  after the break the text starts with From or >.
 * @param {String} txt The text that should be wrapped.
 * @param {Number} width (optional) The width we should wrap to. Default to 72.
 * @return {String} The text with non-quoted lines wrapped. This is suitable for
 *  sending as format=flowed.
 */
function simpleWrap(txt, width) {
  if (!width)
    width = 72;

  function maybeEscape(line) {
    if (line.indexOf("From") === 0 || line.indexOf(">") === 0)
      return (" " + line);
    else
      return line;
  }

  function splitLongLine(soFar, remaining) {
    if (remaining.length > width) {
      let i = width - 1;
      while (remaining[i] != " " && i > 0)
        i--;
      if (i > 0) {
        // This includes the trailing space that indicates that we are wrapping
        //  a long line with format=flowed.
        soFar.push(maybeEscape(remaining.substring(0, i+1)));
        return splitLongLine(soFar, remaining.substring(i+1, remaining.length));
      } else {
        let j = remaining.indexOf(" ");
        if (j > 0) {
          // Same remark.
          soFar.push(maybeEscape(remaining.substring(0, j+1)));
          return splitLongLine(soFar, remaining.substring(j+1, remaining.length));
        } else {
          // Make sure no one interprets this as a line continuation.
          soFar.push(remaining.trimRight());
          return soFar.join("\n");
        }
      }
    } else {
      // Same remark.
      soFar.push(maybeEscape(remaining.trimRight()));
      return soFar.join("\n");
    }
  }

  let lines = txt.split(/\r?\n/);

  for each (let [i, line] in Iterator(lines)) {
    if (line.length > width && line[0] != ">")
      lines[i] = splitLongLine([], line);
  }
  return lines.join("\n");
}

/**
 * Convert HTML into text/plain suitable for insertion right away in the mail
 *  body. If there is text with >'s at the beginning of lines, these will be
 *  space-stuffed, and the same goes for Froms. <blockquote>s will be converted
 *  with the suitable >'s at the beginning of the line, and so on...
 * This function also takes care of rewrapping at 72 characters, so your quoted
 *  lines will be properly wrapped too. This means that you can add some text of
 *  your own, and then pass this to simpleWrap, it should "just work" (unless
 *  the user has edited a quoted line and made it longer than 990 characters, of
 *  course).
 * @param {String} aHtml A string containing the HTML that's to be converted.
 * @return {String} A text/plain string suitable for insertion in a mail body.
 */
function htmlToPlainText(aHtml) {
  // Yes, this is ridiculous, we're instanciating composition fields just so
  //  that they call ConvertBufPlainText for us. But ConvertBufToPlainText
  //  really isn't easily scriptable, so...
  let fields = Cc["@mozilla.org/messengercompose/composefields;1"]
                  .createInstance(Ci.nsIMsgCompFields);
  fields.body = aHtml;
  fields.forcePlainText = true;
  fields.ConvertBodyToPlainText();
  return fields.body;
}

/**
 * Just try to convert quoted lines back to HTML markup (<blockquote>s).
 * @param {String} txt
 * @return {String}
 */
function plainTextToHtml(txt) {
  let citeLevel = function (line) {
    let i;
    for (i = 0; line[i] == ">" && i < line.length; ++i)
      ; // nop
    return i;
  };
  let lines = txt.split(/\r?\n/);
  let newLines = [];
  let level = 0;
  for each (let [, line] in Iterator(lines)) {
    let newLevel = citeLevel(line);
    if (newLevel > level)
      for (let i = level; i < newLevel; ++i)
        newLines.push('<blockquote type="cite">');
    if (newLevel < level)
      for (let i = newLevel; i < level; ++i)
        newLines.push('</blockquote>');
    let newLine = line[newLevel] == " "
      ? escapeHtml(line.substring(newLevel + 1, line.length))
      : escapeHtml(line.substring(newLevel, line.length))
    ;
    newLines.push(newLine);
    level = newLevel;
  }
  return newLines.join("\n");
}
