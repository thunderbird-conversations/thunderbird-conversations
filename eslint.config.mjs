import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";
import json from "eslint-plugin-json";
import react from "eslint-plugin-react";
import imports from "eslint-plugin-import";
import mozilla from "eslint-plugin-mozilla";
import { fixupPluginRules } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: ["dist**", "package-lock.json"],
  },
  ...mozilla.configs["flat/recommended"],
  {
    files: ["**/*.mjs"],
    rules: {
      "no-shadow": [
        "error",
        { allow: ["event", "name"], builtinGlobals: true },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: { import: fixupPluginRules(imports) },
    rules: {
      "import/default": "error",
      "import/export": "error",
      "import/named": "error",
      "import/namespace": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "import/no-absolute-path": "error",
      "import/no-named-default": "error",
      "import/no-named-as-default": "error",
      "import/no-named-as-default-member": "error",
      "import/no-self-import": "error",
      "import/no-unassigned-import": "error",
      "import/no-unresolved": "error",
      "import/no-useless-path-segments": "error",
    },
    settings: {
      "import/extensions": [".mjs"],
      // To work around the flat configuration not working yet in
      // eslint-plugin-import.
      // https://github.com/import-js/eslint-plugin-import/issues/2556
      "import/parsers": {
        espree: [".mjs"],
      },
      "import/resolver": {
        node: true,
      },
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
      "addon/content/stubWrapper.mjs",
      "addon/experiment-api/*.js",
    ],
    languageOptions: {
      globals: {
        ...mozilla.environments.privileged.globals,
        ...mozilla.environments.specific.globals,
      },
    },
  },
  {
    files: ["**/*.mjs"],
    ...react.configs.flat.recommended,
    languageOptions: {
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
    files: ["**/*.{js,mjs}"],
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
      // We want to check the global scope everywhere.
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
  {
    files: ["**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  eslintConfigPrettier,
];
