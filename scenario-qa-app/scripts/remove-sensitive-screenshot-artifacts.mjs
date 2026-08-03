import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(process.env.NUXT_STORAGE_ROOT ?? "storage");
const appRoot = process.cwd();
const runFile = path.join(storageRoot, "test-runs.json");
const runs = JSON.parse(await readFile(runFile, "utf8"));
const removedPaths = new Set();
let changedResults = 0;

for (const run of runs) {
  if (!run.resultFilePath || !Array.isArray(run.scenarioSteps)) continue;
  const firstSensitiveOrder = run.scenarioSteps
    .filter((step) => step.sensitive || /\{\{TEST_(?:LOGIN|INVALID_LOGIN|ADMIN)_(?:ID|PASSWORD)\}\}/.test(step.value ?? ""))
    .reduce((minimum, step) => Math.min(minimum, step.order), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(firstSensitiveOrder)) continue;
  const resultPath = safeStoragePath(run.resultFilePath);
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  let changed = false;
  for (const step of result.steps ?? []) {
    const source = run.scenarioSteps.find((candidate) => candidate.id === step.stepId);
    if (!step.screenshotPath || !source || source.order < firstSensitiveOrder) continue;
    const screenshotPath = safeStoragePath(step.screenshotPath);
    await rm(screenshotPath, { force: true });
    removedPaths.add(path.relative(appRoot, screenshotPath).replaceAll("\\", "/"));
    step.screenshotPath = null;
    changed = true;
  }
  if (changed) {
    await writeJsonAtomic(resultPath, result);
    changedResults += 1;
  }
}

for (const run of runs) {
  if (!Array.isArray(run.artifacts)) continue;
  run.artifacts = run.artifacts.filter((artifact) => !removedPaths.has(artifact.relativePath.replaceAll("\\", "/")));
}
const referencedArtifacts = new Set(
  runs.flatMap((run) => (run.artifacts ?? []).map((artifact) => artifact.relativePath.replaceAll("\\", "/")))
);
const screenshotsDirectory = path.join(storageRoot, "artifacts", "screenshots");
let removedOrphans = 0;
for (const entry of await readdir(screenshotsDirectory, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isFile() || entry.name === ".gitkeep") continue;
  const absolute = path.join(screenshotsDirectory, entry.name);
  const relative = path.relative(appRoot, absolute).replaceAll("\\", "/");
  if (referencedArtifacts.has(relative)) continue;
  await rm(absolute, { force: true });
  removedOrphans += 1;
}
await writeJsonAtomic(runFile, runs);
console.log(JSON.stringify({ removedScreenshots: removedPaths.size, removedOrphans, changedResults }, null, 2));

function safeStoragePath(relativePath) {
  const absolute = path.resolve(appRoot, relativePath);
  const relative = path.relative(storageRoot, absolute);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe artifact path: ${relativePath}`);
  }
  return absolute;
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.security.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (process.platform === "win32") await rm(file, { force: true });
  await rename(temporary, file);
}
