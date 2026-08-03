import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getReadiness } from "../../health/health-service.js";
import { testRunService } from "../../services/container.js";
import { getStorageRoot } from "../../utils/file-storage.js";

export default defineEventHandler(async () => {
  const storageRoot = getStorageRoot();
  const [health, runs, storageBytes, artifactBytes, latestBackupAt] = await Promise.all([
    getReadiness(),
    testRunService.list(),
    directorySize(storageRoot),
    directorySize(path.join(storageRoot, "artifacts")),
    latestFileTime("/app/backups")
  ]);
  const latestRun = runs[0];
  return {
    ...health,
    deploymentTimestamp: process.env.DEPLOYED_AT ?? health.buildTimestamp,
    storage: { bytes: storageBytes, artifactBytes },
    scheduler: health.checks.scheduler,
    activeRunCount: runs.filter((run) => run.status === "pending" || run.status === "running").length,
    latestRun: latestRun === undefined ? null : { id: latestRun.id, status: latestRun.status, createdAt: latestRun.createdAt },
    latestBackupAt,
    integrations: {
      emailConfigured: (process.env.NOTIFICATION_EMAIL_PROVIDER ?? "disabled") === "smtp",
      slackConfigured: process.env.NOTIFICATION_SLACK_ENABLED === "true",
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
    }
  };
});

async function directorySize(root: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(candidate);
    else if (entry.isFile()) total += (await stat(candidate)).size;
  }
  return total;
}

async function latestFileTime(root: string): Promise<string | null> {
  let latest = 0;
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith(".tar.gz")) continue;
    latest = Math.max(latest, (await stat(path.join(root, entry.name))).mtimeMs);
  }
  return latest === 0 ? null : new Date(latest).toISOString();
}
