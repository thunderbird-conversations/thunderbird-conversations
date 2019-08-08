/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["PluginHelpers"];

/**
 * This file just contains helpers for our Gloda plugins. The function in
 *  PluginHelpers are used in the gloda attribute providers, as well as in the
 *  main message code that kicks in when the message hasn't been indexed by
 *  gloda yet (see message.js).
 */

const {GlodaUtils} = ChromeUtils.import("resource:///modules/gloda/utils.js");

const gsfnRegexp = /^(.+)(?:, an employee of Mozilla Messaging,)? (?:replied to|commented on|just asked)/;
const gsfnFrom = "Mozilla Messaging <noreply.mozilla_messaging@getsatisfaction.com>";

var PluginHelpers = {
  // About to do more special-casing here? Please check out the corresponding
  //  code in contact.js and make sure you modify it too.
  alternativeSender: function _PluginHelpers_alternativeSender(aRawReps) {
    let aMimeMsg = aRawReps.mime;
    let aMsgHdr = aRawReps.header;

    // This header is a bare email address
    if (aMimeMsg && ("x-bugzilla-who" in aMimeMsg.headers))
        return aMimeMsg.headers["x-bugzilla-who"];

    // The thing is, the template caches the contacts according to their
    // emails, so we need to make sure the email address is unique for each
    // person (otherwise Person A <email> is cached with email as the key, and
    // Person B <sameemail> appears as Person A. See contact.js
    let uniq = s => GlodaUtils.md5HashString(s).substring(0, 8);

    // We sniff for a name
    if (aMimeMsg && aMimeMsg.headers.from == gsfnFrom) {
      let body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
      let m = body.match(gsfnRegexp);
      if (m && m.length)
        return (m[1] + " <" + uniq(m[1]) + "@fake.getsatisfaction.com>");
    }

    return null;
  },

  bugzilla: function _PluginHelpers_bugzilla(aRawReps) {
    let aMimeMsg = aRawReps.mime;
    if (!aMimeMsg)
      return null;

    if (aMimeMsg.has("x-bugzilla-who")) {
      let keys = [
        "url",
        "classification",
        "product",
        "component",
        "keywords",
        "severity",
        "status",
        "priority",
        "assigned-to",
        "target-milestone",
        "changed-fields",
      ];
      let o = {};
      for (let k of keys) {
        let v = aMimeMsg.get("x-bugzilla-" + k);
        if (v)
          o[k] = GlodaUtils.deMime(v);
      }
      return o;
    }

    return null;
  },
};
