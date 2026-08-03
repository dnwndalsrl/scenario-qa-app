import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const storageRoot = path.resolve(process.env.NUXT_STORAGE_ROOT ?? "storage");
const sensitiveName = /(PASSWORD|TOKEN|SECRET|COOKIE|AUTHORIZATION|API_KEY|PRIVATE_KEY|LOGIN_ID|ADMIN_ID)/i;
const sensitiveValues = [...new Set(
  Object.entries(process.env)
    .filter(([name, value]) => sensitiveName.test(name) && value && value.length >= 4)
    .map(([, value]) => value)
)].sort((left, right) => right.length - left.length);

if (sensitiveValues.length === 0) {
  console.log("No configured sensitive values were available for matching.");
  process.exit(0);
}

const files = await listFiles(storageRoot);
const changed = [];
for (const file of files) {
  const original = await readFile(file, "utf8");
  let sanitized = original;
  for (const value of sensitiveValues) sanitized = sanitized.replaceAll(value, "[REDACTED]");
  if (sanitized === original) continue;
  if (file.endsWith(".json") || file.endsWith(".bak")) JSON.parse(sanitized);
  await atomicReplace(file, sanitized);
  changed.push(path.relative(storageRoot, file));
}

console.log(JSON.stringify({ scannedFiles: files.length, changedFiles: changed.length, files: changed }, null, 2));

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(target));
    else if (/\.(?:json|bak|log|txt)$/i.test(entry.name)) result.push(target);
  }
  return result;
}

async function atomicReplace(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.sanitize.tmp`;
  const recovery = `${file}.${process.pid}.sanitize.bak`;
  await writeFile(temporary, content, "utf8");
  await copyFile(file, recovery);
  try {
    if (process.platform === "win32") {
      await rm(file, { force: true });
      await rename(temporary, file);
    } else {
      await rename(temporary, file);
    }
    await rm(recovery, { force: true });
  } catch (error) {
    await copyFile(recovery, file).catch(() => undefined);
    throw error;
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
