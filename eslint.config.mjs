import globals from "globals";
import json from "@eslint/json";
import jsdoc from "eslint-plugin-jsdoc";
import react from "eslint-plugin-react";
import { importX } from "eslint-plugin-import-x";
import mozilla from "eslint-plugin-mozilla";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    ignores: ["dist**", "package-lock.json", "**/*.html", "**/*.xhtml"],
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
    ...importX.flatConfigs.recommended,
    rules: {
      ...importX.flatConfigs.recommended.rules,
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "import-x/no-absolute-path": "error",
      "import-x/no-named-default": "error",
      "import-x/no-named-as-default": "error",
      "import-x/no-named-as-default-member": "error",
      "import-x/no-self-import": "error",
      "import-x/no-unassigned-import": "error",
      "import-x/no-useless-path-segments": "error",
    },
    settings: {
      "import-x/extensions": [".mjs"],
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
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["**/*.json"],
    language: "json/json",
    ...json.configs.recommended,
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
        { definedTypes: ["MessageHeader", "NodeListOf"] },
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
    settings: {
      jsdoc: { mode: "typescript" },
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
  {
    files: ["**/*.*js*"],
    rules: {
      curly: "error",
    },
  },
];
