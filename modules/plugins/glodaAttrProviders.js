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

var EXPORTED_SYMBOLS = [];

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

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://conversations/modules/plugins/helpers.js");
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

  process: function* _AlternativeSender_process (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    try {
      let alternativeSender = PluginHelpers.alternativeSender(aRawReps);
      if (alternativeSender)
        aGlodaMessage.alternativeSender = alternativeSender;
    } catch (e) {
      dump(e+"\n"+e.stack+"\n");
    }

    yield Gloda.kWorkDone;
  },
};

AlternativeSender.init();

let ContentType = {
  init: function _ContentType_init () {
    this.defineAttributes();
  },

  defineAttributes: function _ContentType_defineAttributes () {
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

  process: function* _ContentType_process (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    try {
      if (aRawReps.mime)
        aGlodaMessage.contentType = aRawReps.mime.headers["content-type"];
    } catch (e) {
      dump(e+"\n"+e.stack+"\n");
    }

    yield Gloda.kWorkDone;
  },
};

ContentType.init();

let Bugzilla = {
  init: function _Bugzilla_init () {
    this.defineAttributes();
  },

  defineAttributes: function _Bugzilla_defineAttributes () {
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

  process: function* _Bugzilla_process (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    try {
      let bugzilla = PluginHelpers.bugzilla(aRawReps);
      if (bugzilla)
        aGlodaMessage.bugzillaInfos = JSON.stringify(bugzilla);
    } catch (e) {
      dump(e+"\n"+e.stack+"\n");
    }

    yield Gloda.kWorkDone;
  },
};

Bugzilla.init();

let ConversationSubject = {
  init: function _ConversationSubject_init () {
    this.defineAttributes();
  },

  defineAttributes: function _ConversationSubject_defineAttributes () {
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

  process: function* _ConversationSubject_process (aGlodaMessage, aRawReps, aIsNew, aCallbackHandle) {
    let aMimeMsg = aRawReps.mime;
    yield Gloda.kWorkDone;
  },
}

ConversationSubject.init();
