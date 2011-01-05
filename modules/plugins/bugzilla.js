/*
 * This is a bugzilla plugin for Gloda. This plugin does one very simple thing:
 * it looks for a x-bugzilla-who header, and if present, adds an
 * alternativeSender field to the gloda message.
 *
 * Previously, we used to stream the message to gain that information. Now, we
 * get it for free through the gloda query (as usual, non-indexed message header
 * will need re-streaming).
 */

var EXPORTED_SYMBOLS = [];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource:///modules/gloda/public.js");
Cu.import("resource:///modules/gloda/mimemsg.js");

let AlternativeSender = {
  init: function _AlternativeSender_init () {
    this.defineAttributes();
  },

  defineAttributes: function _AlternativeSender_defineAttributes () {
    this._alternativeSenderAttribute = Gloda.defineAttribute({
      provider: this,
      extensionName: "bugzilla-alternative-sender",
      attributeType: Gloda.kAttrDerived,
      attributeName: "alternativeSender",
      bind: true,
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.NOUN_STRING,
    });
  },

  process: function _AlternativeSender_process (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    let aMimeMsg = aRawReps.mime;
    if (aMimeMsg && ("x-bugzilla-who" in aMimeMsg.headers))
        aGlodaMessage.alternativeSender = aMimeMsg.headers["x-bugzilla-who"];

    yield Gloda.kWorkDone;
  },
}

AlternativeSender.init();
