import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "data/storage");
let count = 0;
for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
  JSON.parse(await readFile(path.join(root, entry.name), "utf8"));
  count += 1;
}
console.log(`Validated ${count} storage JSON file(s).`);
