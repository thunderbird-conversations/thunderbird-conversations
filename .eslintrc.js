"use strict";

/* eslint-env node */
/* eslint sort-keys: "error" */

module.exports = {
  extends: ["plugin:mozilla/recommended", "plugin:react/recommended"],
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
        "addon/*.jsx",
        "addon/content/es-modules/**/*.js",
        "addon/content/es-modules/**/*.jsx",
      ],
      parserOptions: {
        sourceType: "module",
      },
    },
  ],
  plugins: ["mozilla", "html", "react"],
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
