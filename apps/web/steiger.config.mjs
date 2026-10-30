import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

/**
 * FSD architecture lint for `@spectre/web` (**D-023** / ADR-0002).
 * Run: `pnpm --filter @spectre/web lint:fsd`
 */
export default defineConfig([
  ...fsd.configs.recommended,
  {
    ignores: ["./.next/**", "./node_modules/**", "./next-env.d.ts"],
  },
  {
    // Early scaffold: few references per slice is expected until more screens exist.
    rules: {
      "fsd/insignificant-slice": "warn",
    },
  },
]);
