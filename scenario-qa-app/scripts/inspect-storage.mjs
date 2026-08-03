import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(process.env.NUXT_STORAGE_ROOT ?? "storage");
const resultRetentionDays = positive(process.env.TEST_RESULT_RETENTION_DAYS, 90);
const artifactRetentionDays = positive(process.env.TEST_ARTIFACT_RETENTION_DAYS, 30);
const now = Date.now();
const files = await listFiles(storageRoot);
const inventory = [];
for (const file of files) {
  const information = await stat(file);
  const relativePath = path.relative(storageRoot, file);
  inventory.push({
    relativePath,
    bytes: information.size,
    modifiedAt: information.mtime.toISOString(),
    category: classify(relativePath)
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  storageRoot,
  policy: { resultRetentionDays, artifactRetentionDays, mode: "inspect_only" },
  totals: {
    files: inventory.length,
    bytes: inventory.reduce((sum, item) => sum + item.bytes, 0),
    megabytes: Number((inventory.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(2))
  },
  categories: Object.fromEntries(
    [...new Set(inventory.map((item) => item.category))].sort().map((category) => {
      const selected = inventory.filter((item) => item.category === category);
      return [category, { files: selected.length, bytes: selected.reduce((sum, item) => sum + item.bytes, 0) }];
    })
  ),
  cleanupCandidates: inventory.filter((item) => {
    const ageDays = (now - Date.parse(item.modifiedAt)) / 86_400_000;
    if (item.category === "screenshot") return ageDays > artifactRetentionDays;
    if (item.category === "result") return ageDays > resultRetentionDays;
    return item.category === "temporary";
  }).map((item) => item.relativePath),
  recordCounts: await readRecordCounts(storageRoot),
  note: "This command is read-only. Review references before deleting result metadata or artifacts."
};

await writeFile("readiness-storage-inspection.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(target));
    else result.push(target);
  }
  return result;
}

function classify(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (/\.tmp$|\.swap$|\.sanitize\.(?:tmp|bak)$/i.test(normalized)) return "temporary";
  if (normalized.startsWith("backups/")) return "backup";
  if (/\.(?:png|jpg|jpeg|webp)$/i.test(normalized)) return "screenshot";
  if (normalized.includes("/results/") || normalized.startsWith("artifacts/results/")) return "result";
  if (/\.log$/i.test(normalized)) return "log";
  return "metadata";
}

async function readRecordCounts(root) {
  const result = {};
  for (const name of ["projects.json", "scenarios.json", "test-runs.json", "test-suites.json", "test-suite-runs.json", "test-schedules.json", "test-schedule-executions.json", "notification-deliveries.json"]) {
    try {
      const parsed = JSON.parse(await readFile(path.join(root, name), "utf8"));
      result[name] = Array.isArray(parsed) ? parsed.length : null;
    } catch {
      result[name] = null;
    }
  }
  return result;
}

function positive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
