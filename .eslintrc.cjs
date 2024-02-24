"use strict";

/* eslint-env node */
/* eslint sort-keys: "error" */

module.exports = {
  env: {
    es2020: true,
  },
  extends: [
    "plugin:mozilla/recommended",
    "plugin:react/recommended",
    "plugin:jsdoc/recommended",
    "plugin:json/recommended",
  ],
  overrides: [
    {
      // This marks exported symbols as used for our modules.
      files: ["addon/content/modules/**/*.js"],
      rules: {
        "mozilla/mark-exported-symbols-as-used": "error",
      },
    },
    {
      env: {
        webextensions: true,
      },
      excludedFiles: [
        "addon/content/modules/browserSim.js",
        "addon/content/stubGlobals.js",
        "addon/experiment-api/**",
      ],
      files: ["addon/**/*.*js*"],
      parserOptions: {
        sourceType: "module",
      },
    },
    {
      env: {
        webextensions: true,
      },
      excludedFiles: ["addon/content/modules/**/*.js"],
      files: ["addon/content/**/*.js", "addon/content/**/*.jsx"],
    },
    {
      files: ["**/*.jsx"],
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    {
      env: {
        browser: false,
      },
      files: [
        "addon/*.js",
        "addon/experiment-api/*.js",
        "addon/content/modules/**/*.js",
      ],
    },
    {
      env: {
        jest: true,
      },
      files: ["addon/tests/*.test.js*", "addon/tests/*.test.mjs*"],
    },
  ],
  // Override mozilla/recommended to get private class fields
  parserOptions: {
    ecmaVersion: 13,
  },
  plugins: ["mozilla", "html", "jsdoc", "json", "react"],
  root: true,
  rules: {
    "jsdoc/check-tag-names": "error",
    "jsdoc/check-types": "error",
    "jsdoc/no-undefined-types": ["error", { definedTypes: ["MessageHeader"] }],
    "jsdoc/require-jsdoc": [
      "error",
      { require: { ClassDeclaration: true, FunctionDeclaration: false } },
    ],
    "jsdoc/require-param": "error",
    "jsdoc/require-param-description": "off",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-property": "off",
    "jsdoc/require-returns": "off",
    "jsdoc/require-returns-description": "off",
    "jsdoc/require-returns-type": "error",
    "jsdoc/tag-lines": ["error", "never", { startLines: 1 }],
    "jsdoc/valid-types": "error",
    // We want to check the global scope everywhere.
    "no-unused-vars": [
      "error",
      {
        args: "none",
        vars: "all",
      },
    ],
  },
  settings: {
    react: {
      version: "16.0",
    },
  },
};
