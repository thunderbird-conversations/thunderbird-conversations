"use strict";

/* eslint-env node */
/* eslint sort-keys: "error" */

module.exports = {
  extends: [
    "plugin:mozilla/recommended",
    "plugin:react/recommended",
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
      excludedFiles: ["addon/bootstrap.js"],
      files: [
        "addon/*.js",
        "addon/assistant/*.js",
        "addon/gallery/*.js*",
        "addon/options/*.js*",
        "addon/content/es-modules/**/*.js",
        "addon/content/es-modules/**/*.jsx",
      ],
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
      env: {
        browser: false,
      },
      files: [
        "addon/*.js",
        "addon/experiment-api/*.js",
        "addon/content/modules/**/*.js",
      ],
    },
  ],
  plugins: ["mozilla", "html", "json", "react"],
  root: true,
  rules: {
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
