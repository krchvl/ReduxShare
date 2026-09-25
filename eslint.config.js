import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  prettierConfig,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": "error",
      "react-hooks/exhaustive-deps": "error",

      "unused-imports/no-unused-imports": "error",
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["src/logic/runtime.ts", "src/content/stealthConsole.ts", "scripts/**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["pocketbase/pb_migrations/*.js"],
    languageOptions: {
      globals: {
        migrate: "readonly",
        Collection: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: "readonly",
      },
    },
  },
);
