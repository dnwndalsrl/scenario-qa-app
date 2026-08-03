import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  }
});
