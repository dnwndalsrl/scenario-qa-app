import { constants } from "node:fs";
import { access, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { testRunService, testSchedulerService } from "../services/container.js";
import { getStorageRoot } from "../utils/file-storage.js";

const startedAt = new Date().toISOString();

export interface HealthResult {
  status: "ok" | "unavailable";
  version: string;
  commitSha: string;
  buildTimestamp: string;
  timestamp: string;
  startedAt: string;
  uptimeSeconds: number;
  checks: {
    storage: { ok: boolean; message: string };
    artifacts: { ok: boolean; message: string };
    playwright: { ok: boolean; message: string };
    scheduler: ReturnType<typeof testSchedulerService.getHealth> & { ok: boolean };
    runner: { ok: boolean; acceptingRuns: boolean; busy: boolean };
  };
}

export function getLiveness() {
  return {
    status: "ok" as const,
    version: process.env.APP_VERSION ?? "development",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  };
}

export async function getReadiness(): Promise<HealthResult> {
  const storageRoot = getStorageRoot();
  const [storage, artifacts, playwright, runnerBusy] = await Promise.all([
    checkDirectory(storageRoot, "storage"),
    checkDirectory(path.join(storageRoot, "artifacts"), "artifacts"),
    checkBrowser(),
    testRunService.isBusy().catch(() => true)
  ]);
  const schedulerState = testSchedulerService.getHealth();
  const scheduler = {
    ...schedulerState,
    ok: !schedulerState.enabled || schedulerState.running
  };
  const runner = {
    ok: testRunService.isAcceptingRuns(),
    acceptingRuns: testRunService.isAcceptingRuns(),
    busy: runnerBusy
  };
  const ok = storage.ok && artifacts.ok && playwright.ok && scheduler.ok && runner.ok;

  return {
    status: ok ? "ok" : "unavailable",
    version: process.env.APP_VERSION ?? "development",
    commitSha: process.env.GIT_COMMIT_SHA ?? "unknown",
    buildTimestamp: process.env.BUILD_TIMESTAMP ?? "unknown",
    timestamp: new Date().toISOString(),
    startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    checks: { storage, artifacts, playwright, scheduler, runner }
  };
}

async function checkDirectory(root: string, label: string): Promise<{ ok: boolean; message: string }> {
  const probe = path.join(root, `.health-${process.pid}-${Date.now()}`);
  try {
    await mkdir(root, { recursive: true });
    await access(root, constants.R_OK | constants.W_OK);
    await writeFile(probe, "ok", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rm(probe, { force: true });
    return { ok: true, message: `${label} is readable and writable` };
  } catch {
    await rm(probe, { force: true }).catch(() => undefined);
    return { ok: false, message: `${label} is not writable` };
  }
}

async function checkBrowser(): Promise<{ ok: boolean; message: string }> {
  try {
    const executable = chromium.executablePath();
    const details = await stat(executable);
    return details.isFile()
      ? { ok: true, message: "Chromium executable is installed" }
      : { ok: false, message: "Chromium executable is invalid" };
  } catch {
    return { ok: false, message: "Chromium executable is not installed" };
  }
}
