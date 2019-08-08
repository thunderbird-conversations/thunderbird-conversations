/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* exported wrapHandlebars */

/* global $, Handlebars, Log, dumpCallStack, StringBundle */

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
    return "";
  };
  window.tmpl = function(id, data) {
    let html = tmpl0(id, data);
    let parser = new DOMParser();
    let doc = parser.parseFromString(html, "text/html");
    if ($.isArray(data)) {
      return Array.from(doc.body.childNodes);
    }
    return doc.body.firstChild;
  };

  let strings = new StringBundle("chrome://conversations/locale/template.properties");
  let str0 = function(x, ...args) {
    try {
      var s = strings.get(x);
      // One extra argument added by Handlebars
      for (let i = 0; i < args.length - 1; ++i)
        s = s.replace("#" + (i + 1), Handlebars.Utils.escapeExpression(args[i]));
      return s;
    } catch (e) {
      Log.error("No such string", x);
      Log.debug(e);
      dumpCallStack(e);
    }
    return "";
  };
  let str = function(x, ...args) {
    return new Handlebars.SafeString(str0(x, ...args));
  };
  let strC = function(x, ...args) {
    var s = str0(x, ...args);
    return new Handlebars.SafeString(s.charAt(0).toUpperCase() + s.substring(1));
  };
  let tmpl = function(short, data) {
    var id = "#" + short + "Template";
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
