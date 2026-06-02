import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // DB integration tests boot PGlite (WASM) and run migrations; the first one
    // pays a cold-start cost that exceeds the 5s default on slower CI runners.
    testTimeout: 30_000,
  },
});
