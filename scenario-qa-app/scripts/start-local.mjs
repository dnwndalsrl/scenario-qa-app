import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = path.resolve(appRoot, "../scenario-test-runner/.playwright-browsers");
const productionServer = path.join(appRoot, ".output/server/index.mjs");
const nuxtCli = path.join(appRoot, "node_modules/nuxt/bin/nuxt.mjs");
const skipBuild = process.argv.includes("--skip-build");
const children = new Set();
let stopping = false;
const env = {
  ...process.env, HOST: "127.0.0.1", PORT: "3100", NODE_ENV: "production", NUXT_STORAGE_ROOT: path.join(appRoot, "storage"),
  ALLOW_LOCAL_TEST_TARGETS: "true", ALLOWED_LOCAL_TEST_PORTS: "3000,3001", PLAYWRIGHT_BROWSERS_PATH: browserRoot
};

if (!skipBuild) {
  const result = spawnSync(process.execPath, [nuxtCli, "build"], { cwd: appRoot, env, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
start([path.join(appRoot, "test/fixtures/site/server.mjs")], { ...env, FIXTURE_PORT: "3000" });
start([productionServer], env);
console.log("\nProbe QA: http://127.0.0.1:3100");
console.log("테스트 fixture: http://127.0.0.1:3000\n");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));

function start(args, childEnv) {
  const child = spawn(process.execPath, args, { cwd: appRoot, env: childEnv, stdio: "inherit", windowsHide: true });
  children.add(child); child.on("exit", (code) => { children.delete(child); if (!stopping) stop(code || 1); }); return child;
}
function stop(code) { if (stopping) return; stopping = true; for (const child of children) child.kill(); setTimeout(() => process.exit(code), 200).unref(); }
