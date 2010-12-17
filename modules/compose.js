var EXPORTED_SYMBOLS = ["quoteMsgHdr", "citeString"]

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/XPCOMUtils.jsm"); // for generateQI
Cu.import("resource:///modules/StringBundle.js"); // for StringBundle
Cu.import("resource:///modules/NetUtil.jsm");

Cu.import("resource://conversations/VariousUtils.jsm");
Cu.import("resource://conversations/MsgHdrUtils.jsm");
Cu.import("resource://conversations/log.js");

let Log = setupLogging("Conversations.Compose");

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
  //  /**
  //   * Quote a particular message specified by its URI.
  //   *
  //   * @param charset optional parameter - if set, force the message to be
  //   *                quoted using this particular charset
  //   */
  //   void quoteMessage(in string msgURI, in boolean quoteHeaders,
  //                     in nsIMsgQuotingOutputStreamListener streamListener,
  //                     in string charset, in boolean headersOnly);
  let quoter = Cc["@mozilla.org/messengercompose/quoting;1"]
               .createInstance(Ci.nsIMsgQuote);
  quoter.quoteMessage(msgUri, false, listener, "", false);
}

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
