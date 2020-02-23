/*
 * This is a temporary wrapper. XUL doesn't allow es-modules, but eventually
 * all components should be exported as es-modules. This code "re-exports"
 * globals as es-modules, which enables them to be imported (e.g. for tests)
 * or used as globals.
 *
 * When the switch to a WebExtension is done, the actual code should be migrated
 * here and the global variable workarounds should be removed.
 */

/* globals require */

// Make sure all the libraries that need to be in global scope are in global scope.
import { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes } from "../ui.js";
Object.assign(window, { React, ReactDOM, Redux, ReactRedux, RTK, PropTypes });

// Set up an object for the make-shift module emulation
window.esExports = {};
// the node.js `esm` loader won't share globals. Since this is only used
// by tests at the moment, which are run by node.js, use the `require`
// function.
require("../../messageTags.js");

export const MessageTag = window.esExports.MessageTag;
export const MessageTags = window.esExports.MessageTags;
export const SpecialMessageTag = window.esExports.SpecialMessageTag;
export const SpecialMessageTags = window.esExports.SpecialMessageTags;
