"use strict";

/* eslint-env node */
/* eslint sort-keys: "error" */

module.exports = {
  "env": {
    "browser": true,
    "es6": true,
  },
  // "globals": {
  // },
  "extends": [
    "plugin:mozilla/recommended"
  ],
  "overrides": [{
    // XXX Fix the not really undefined variables in these files.
    "files": [
      "content/*.js",
    ],
    "rules": {
      "no-undef": "off",
    },
  }, {
    // This marks exported symbols as used for our modules.
    "files": [
      "modules/**/*.js",
    ],
    "rules": {
      "mozilla/mark-exported-symbols-as-used": "error",
    },
  }],
  "plugins": [
    "mozilla"
  ],
  "rules": {
    // XXX These are all rules that mozilla/recommended set, but we currently
    // don't pass. We should enable these over time.
    "complexity": ["error", 34],
    "consistent-return": "off",
    "mozilla/avoid-removeChild": "off",
    "mozilla/no-useless-removeEventListener": "off",
    // For now, turn this off, since we want to support TB 60 (only added in 62).
    "mozilla/use-chromeutils-generateqi": "off",
    "mozilla/use-ownerGlobal": "off",
    "no-lonely-if": "off",
    "no-nested-ternary": "off",
    "no-undef": "error",
    // We want to check the global scope everywhere.
    "no-unused-vars": ["error", {
      "args": "none",
      "vars": "all",
    }],
    "no-useless-call": "off",
    "quotes": "off",
    "space-infix-ops": "off",
  }
};
