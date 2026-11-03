// @ts-check
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Code-quality lint for `@spectre/web`.
 * FSD layer/import boundaries are enforced by Steiger (`lint:fsd`), not duplicated here.
 */
export default defineConfig(
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "steiger.config.ts"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      /**
       * Prefer public APIs of FSD slices (`@/entities/session`, not deep paths).
       * Steiger `fsd/no-public-api-sidestep` is the authoritative check.
       */
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/entities/*/*", "@/features/*/*", "@/widgets/*/*"],
              message:
                "Import from the slice public API (`@/layer/slice`), not from internal segments (D-023).",
            },
            {
              group: ["@/shared/*/*", "@/shared/*/*/*"],
              message:
                "Import from `@/shared/<segment>` public API (e.g. `@/shared/api`, `@/shared/ui`), not deeper paths.",
            },
            {
              group: ["@/components", "@/components/*"],
              message: "Do not use a flat `@/components` tree; place UI in FSD layers (D-023).",
            },
          ],
        },
      ],
    },
  },
);
