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

"use strict";

// Tiny compatibility wrapper so that we can use Handlebars just like we used
// jquery-tmpl. This is called from the two "web-pages" that the extension
// provides: stub.xhtml and gallery/index.html.
function wrapHandlebars() {
  let tmpl0 = function(id, data) {
    try {
      // Per compatibility with the old spec of jquery-tmpl.
      if (!$.isArray(data))
        data = [data];
      var t = Handlebars.compile(document.querySelector(id).innerHTML);
      var html = "";
      for (let i = 0; i < data.length; ++i)
        html += t(data[i]).trim();
      return html;
    } catch (e) {
      Log.error("Couldn't compile template", id, "because of:", e);
      dumpCallStack(e);
    }
  };
  window.tmpl = (id, data) => $(tmpl0(id, data));

  let strings = new StringBundle("chrome://conversations/locale/template.properties");
  let str0 = function(x, ...args) {
    try {
      var s = strings.get(x);
      // One extra argument added by Handlebars
      for (let i = 0; i < args.length - 1; ++i)
        s = s.replace("#"+(i+1), Handlebars.Utils.escapeExpression(args[i]));
      return s;
    } catch (e) {
      Log.error("No such string", x);
      Log.debug(e);
      dumpCallStack(e);
    }
  };
  let str = function(x, ...args) {
    return new Handlebars.SafeString(str0(x, ...args));
  };
  let strC = function(x, ...args) {
    var s = str0(x, ...args);
    return new Handlebars.SafeString(s.charAt(0).toUpperCase() + s.substring(1));
  };
  let tmpl = function(short, data) {
    var id = "#"+short+"Template";
    return new Handlebars.SafeString(tmpl0(id, data));
  };
  let trim = function(s) {
    return String.prototype.trim.call(s || "");
  };

  Handlebars.registerHelper("str", str);
  Handlebars.registerHelper("strC", strC);
  Handlebars.registerHelper("tmpl", tmpl);
  Handlebars.registerHelper("trim", trim);
}
