import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "scripts/**/*.test.ts", "supabase/**/*.test.ts", "test/**/*.test.ts"],
    clearMocks: true,
    testTimeout: 45000,
    hookTimeout: 30000,
    env: {
      PLAYWRIGHT_BROWSERS_PATH: path.resolve(import.meta.dirname, "../scenario-test-runner/.playwright-browsers")
    }
  }
});
