/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["GlodaAttrProviders"];

/*
 * This file contains various attribute providers for Gloda, we're all storing
 *  them in this file. This file acts like a "plugin" for Gloda.
 *
 * The first one is a trivial plugin that adds some extra information to store
 *  on GlodaMessages. This is not even a new column in the table or whatever,
 *  but simply a new entry in the JSON that's stored alongside this message. For
 *  a more detailed explanation of this mechanism, feel free to read:
 *  http://blog.xulforum.org/index.php?post/2011/01/03/An-overview-of-Thunderbird-Conversations
 * This plugin adds a alternativeSender property on GlodaMessage that
 *  corresponds to the X-Bugzilla-Who header, if found. In case we don't have a
 *  GlodaMessage in message.js, we just recover that information through a
 *  lookup in the MimeMessage's headers.
 * We guarantee alternativeSender to be parsable as:
 *  Sender Name <xx@xx.xx>
 *
 * The second one is a plugin that exposes a new subject noun on Gloda
 *  Conversations. This is slightly more advanced, in the sense that it exposes
 *  a column (subject) that's present in the conversation table as a new
 *  attribute that can be queried.
 * We need that for GitHub and GetSatisfaction, who seem to never have heard
 *  about any kind of References: header. As it is very, very irritating, we
 *  launch a different query that tries to find other messages through the
 *  subject, hence this Gloda plugin
 */

const { PluginHelpers } = ChromeUtils.import(
  "chrome://conversations/content/modules/plugins/helpers.js"
);
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(this, "Gloda", () => {
  let tmp = {};
  try {
    ChromeUtils.import("resource:///modules/gloda/public.js", tmp);
  } catch (ex) {
    ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm", tmp);
  }
  return tmp.Gloda;
});

let AlternativeSender = {
  init: function _AlternativeSender_init() {
    this.defineAttributes();
  },

  defineAttributes: function _AlternativeSender_defineAttributes() {
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

  process: function* _AlternativeSender_process(
    aGlodaMessage,
    aRawReps,
    aIsNew,
    aCallbackHandle
  ) {
    try {
      let alternativeSender = PluginHelpers.alternativeSender(aRawReps);
      if (alternativeSender) {
        aGlodaMessage.alternativeSender = alternativeSender;
      }
    } catch (e) {
      dump(e + "\n" + e.stack + "\n");
    }

    yield Gloda.kWorkDone;
  },
};

AlternativeSender.init();

let ContentType = {
  init: function _ContentType_init() {
    this.defineAttributes();
  },

  defineAttributes: function _ContentType_defineAttributes() {
    this._bugzillaAttribute = Gloda.defineAttribute({
      provider: this,
      extensionName: "content-type",
      attributeType: Gloda.kAttrDerived,
      attributeName: "contentType",
      bind: true,
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.NOUN_STRING,
    });
  },

  process: function* _ContentType_process(
    aGlodaMessage,
    aRawReps,
    aIsNew,
    aCallbackHandle
  ) {
    try {
      if (aRawReps.mime) {
        aGlodaMessage.contentType = aRawReps.mime.headers["content-type"];
      }
    } catch (e) {
      dump(e + "\n" + e.stack + "\n");
    }

    yield Gloda.kWorkDone;
  },
};

ContentType.init();

let Bugzilla = {
  init: function _Bugzilla_init() {
    this.defineAttributes();
  },

  defineAttributes: function _Bugzilla_defineAttributes() {
    this._bugzillaAttribute = Gloda.defineAttribute({
      provider: this,
      extensionName: "bugzilla-infos",
      attributeType: Gloda.kAttrDerived,
      attributeName: "bugzillaInfos",
      bind: true,
      singular: true,
      subjectNouns: [Gloda.NOUN_MESSAGE],
      objectNoun: Gloda.NOUN_STRING,
    });
  },

  process: function* _Bugzilla_process(
    aGlodaMessage,
    aRawReps,
    aIsNew,
    aCallbackHandle
  ) {
    try {
      let bugzilla = PluginHelpers.bugzilla(aRawReps);
      if (bugzilla) {
        aGlodaMessage.bugzillaInfos = JSON.stringify(bugzilla);
      }
    } catch (e) {
      dump(e + "\n" + e.stack + "\n");
    }

    yield Gloda.kWorkDone;
  },
};

Bugzilla.init();

let ConversationSubject = {
  init: function _ConversationSubject_init() {
    this.defineAttributes();
  },

  defineAttributes: function _ConversationSubject_defineAttributes() {
    this._alternativeSenderAttribute = Gloda.defineAttribute({
      provider: this,
      extensionName: "conversation-subject",
      attributeType: Gloda.kAttrDerived,
      attributeName: "subject",
      bind: true,
      singular: true,
      special: Gloda.kSpecialString,
      specialColumnName: "subject",
      subjectNouns: [Gloda.NOUN_CONVERSATION],
      objectNoun: Gloda.NOUN_STRING,
      canQuery: true,
    });
  },

  process: function* _ConversationSubject_process(
    aGlodaMessage,
    aRawReps,
    aIsNew,
    aCallbackHandle
  ) {
    yield Gloda.kWorkDone;
  },
};

var GlodaAttrProviders = {
  init() {
    ConversationSubject.init();
  },
};
