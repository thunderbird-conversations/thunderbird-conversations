import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import json from "eslint-plugin-json";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import mozilla from "eslint-plugin-mozilla";
import nounsanitized from "eslint-plugin-no-unsanitized";

// TODO: do we still want html?
// TODO: Mozilla plugin
export default [
  {
    ignores: ["dist**", "package-lock.json"],
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["addon/experiment-api/*.js"],
    languageOptions: {
      sourceType: "script",
    },
  },
  {
    files: [
      "addon/content/modules/*.*js",
      "addon/content/stubGlobals.js",
      "addon/content/stubWrapper.js",
      "addon/experiment-api/*.js",
    ],
    plugins: { mozilla, "no-unsanitized": nounsanitized },
    // processor: json.processors[".json"],
    rules: mozilla.configs.recommended.rules,
    languageOptions: {
      globals: {
        ...mozilla.environments.privileged.globals,
        ...mozilla.environments.specific.globals,
      },
    },
  },
  {
    files: ["**/*.jsx"],
    ...reactRecommended,
    languageOptions: {
      ...reactRecommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    processor: json.processors[".json"],
    rules: json.configs.recommended.rules,
  },
  {
    ignores: [
      "addon/content/modules/**",
      "addon/content/stubGlobals.js",
      "addon/experiment-api/**",
    ],
    files: ["addon/**/*.*js*"],
    languageOptions: {
      globals: {
        ...globals.webextensions,
      },
    },
  },
  {
    ignores: [
      "addon/*.js",
      "addon/experiment-api/*.js",
      "addon/content/modules/**/*.js",
    ],
    files: ["addon/**/*.*js*"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },
  {
    files: [".prettier.config.js", "addon/tests/setup.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["addon/tests/*.test.js*", "addon/tests/*.test.mjs*"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "error",
      // "jsdoc/newline-after-description": "error",
      "jsdoc/no-undefined-types": [
        "error",
        { definedTypes: ["MessageHeader"] },
      ],
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
      // Conversations has its own special logging.
      "no-console": "off",
      // // We want to check the global scope everywhere.
      "no-unused-vars": [
        "error",
        {
          args: "none",
          vars: "all",
        },
      ],
      "no-undef": "error",
    },
  },
];
