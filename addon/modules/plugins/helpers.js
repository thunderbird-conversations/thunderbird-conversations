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

var PluginHelpers = {
  // About to do more special-casing here? Please check out the corresponding
  //  code in contact.js and make sure you modify it too.
  alternativeSender(aRawReps) {
    const aMimeMsg = aRawReps.mime;

    // This header is a bare email address
    if (aMimeMsg && ("x-bugzilla-who" in aMimeMsg.headers))
        return aMimeMsg.headers["x-bugzilla-who"];

    return null;
  },

  bugzilla(aRawReps) {
    const aMimeMsg = aRawReps.mime;
    if (!aMimeMsg)
      return null;

    if (aMimeMsg.has("x-bugzilla-who")) {
      const keys = [
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
      const o = {};
      for (const k of keys) {
        const v = aMimeMsg.get("x-bugzilla-" + k);
        if (v)
          o[k] = GlodaUtils.deMime(v);
      }
      return o;
    }

    return null;
  },
};
