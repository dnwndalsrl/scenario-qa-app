import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(process.env.NUXT_STORAGE_ROOT ?? "storage");
const configuredMinutes = Number(process.env.STORAGE_TEMP_RETENTION_MINUTES ?? "15");
const minimumAgeMs = (Number.isFinite(configuredMinutes) && configuredMinutes >= 5 ? configuredMinutes : 15) * 60 * 1000;
const removed = [];
for (const entry of await readdir(storageRoot, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isFile() || !/^test-runs\.json\.\d+\.\d+\.tmp$/.test(entry.name)) continue;
  const target = path.resolve(storageRoot, entry.name);
  const relative = path.relative(storageRoot, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe cleanup target: ${target}`);
  }
  const information = await stat(target);
  if (Date.now() - information.mtimeMs < minimumAgeMs) continue;
  await rm(target, { force: true });
  removed.push(entry.name);
}
console.log(JSON.stringify({ removedCount: removed.length, files: removed }, null, 2));
