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
  "plugins": [
    "mozilla"
  ],
  "rules": {
    // These are all rules that mozilla/recommended set, but we currently
    // don't pass. We should enable these over time.
    "brace-style": "off",
    "comma-spacing": "off",
    "complexity": ["error", 34],
    "consistent-return": "off",
    "key-spacing": "off",
    "keyword-spacing": "off",
    "mozilla/avoid-nsISupportsString-preferences": "off",
    "mozilla/avoid-removeChild": "off",
    "mozilla/no-useless-parameters": "off",
    "mozilla/no-useless-removeEventListener": "off",
    "mozilla/use-ownerGlobal": "off",
    "no-else-return": "off",
    "no-extra-bind": "off",
    "no-extra-semi": "off",
    "no-lonely-if": "off",
    "no-multi-spaces": "off",
    "no-native-reassign": "off",
    "no-nested-ternary": "off",
    "no-trailing-spaces": "off",
    "no-undef": "error",
    "no-unused-vars": "off",
    "no-useless-call": "off",
    "object-shorthand": "off",
    "quotes": "off",
    "space-before-blocks": "off",
    "space-before-function-paren": "off",
    "space-infix-ops": "off",
    "spaced-comment": "off",
  }
};
