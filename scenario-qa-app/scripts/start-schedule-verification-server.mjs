import path from "node:path";

process.env.PORT = process.env.PORT ?? "3100";
process.env.HOST = process.env.HOST ?? "127.0.0.1";
process.env.TEST_SCHEDULER_ENABLED = "true";
process.env.TEST_SCHEDULER_TICK_INTERVAL_MS = "1000";
process.env.TEST_LOGIN_ID = "qa-user";
process.env.TEST_LOGIN_PASSWORD = "qa-password";
process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  path.resolve(process.cwd(), "../scenario-test-runner/.playwright-browsers");

await import("../.output/server/index.mjs");
