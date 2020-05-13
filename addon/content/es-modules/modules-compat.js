/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Emulate AMD modules' `define` function. All modules imported after this
// module is loaded may be assumed to be AMD modules. It is your responsibility
// to handle the initialization of the modules.

export const amdModules = [];

window.define = function define(deps, moduleFactory = deps) {
  // Sometimes the function is called `define(f)` and sometimes
  // it's called `define([],f)` when there are no deps. Either way,
  // normalize the result.
  if (deps === moduleFactory) {
    deps = [];
  }
  amdModules.push({ deps, moduleFactory });
};
window.define.amd = true;

/**
 * Call a function passing in arguments from a dependency list.
 *
 * @export
 * @param {{deps: string[], moduleFactory: function}} amdItem - an AMD object with a list of deps and a moduleFactory (as created by `define`)
 * @param {object} deps - dependencies indexed by keys in `amdItem.deps`
 * @returns
 */
export function callWithDeps(amdItem, deps) {
  // If `"exports"` is in `amdItem.deps`, it means the module
  // wants to save itself on the exports object. We want the module
  // to be returned instead, so create an exports object that we can return.
  if (!("exports" in deps)) {
    deps = { ...deps, exports: {} };
  }
  const ret = amdItem.moduleFactory(...amdItem.deps.map((dep) => deps[dep]));
  return ret != null ? ret : deps.exports;
}
