import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(process.argv[2] ?? "data/storage");
const activeStatuses = new Set(["pending", "running", "processing", "sending", "queued"]);
const relevantFiles = new Set([
  "test-runs.json",
  "test-suite-runs.json",
  "ai-failure-analyses.json",
  "test-schedule-executions.json",
  "notification-deliveries.json"
]);
let activeCount = 0;

for (const filename of await readdir(storageRoot).catch(() => [])) {
  if (!relevantFiles.has(filename)) continue;
  const parsed = JSON.parse(await readFile(path.join(storageRoot, filename), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${filename} must contain a JSON array.`);
  for (const item of parsed) {
    if (item && typeof item === "object" && activeStatuses.has(String(item.status))) {
      activeCount += 1;
      console.error(`${filename}: active item ${String(item.id ?? "unknown")} (${String(item.status)})`);
    }
  }
}

if (activeCount > 0) {
  console.error(`DEPLOY_ACTIVE_RUN_EXISTS: ${activeCount} active job(s) found.`);
  process.exit(42);
}
console.log("No active test, suite, AI, schedule, or notification job was found.");
