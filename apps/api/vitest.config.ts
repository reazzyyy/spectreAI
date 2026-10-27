import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{spec,e2e-spec}.ts"],
    fileParallelism: false,
    server: {
      deps: {
        inline: [/@spectre\//],
      },
    },
  },
});
