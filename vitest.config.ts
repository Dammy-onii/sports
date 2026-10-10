import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // engine-heavy tests (whole matches and seasons) run slowly in parallel workers
    testTimeout: 60_000,
  },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
