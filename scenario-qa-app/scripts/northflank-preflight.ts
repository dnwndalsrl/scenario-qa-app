import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(appRoot, "..");
const staticOnly = process.argv.includes("--static");

await stage("configuration", () => {
  for (const file of ["Dockerfile", ".env.northflank.example", "server/api/health/live.get.ts", "server/api/health/ready.get.ts"]) {
    if (!existsSync(path.join(appRoot, file))) throw new Error(`필수 파일이 없습니다: ${file}`);
  }
  const dockerfile = readFileSync(path.join(appRoot, "Dockerfile"), "utf8");
  for (const value of ["HOST=0.0.0.0", "EXPOSE 3000", "USER 10001:10001", "playwright/cli.js install --with-deps chromium"]) {
    if (!dockerfile.includes(value)) throw new Error(`Dockerfile 필수 설정이 없습니다: ${value}`);
  }
});
await stage("typecheck", () => run("npm", ["run", "typecheck"], appRoot));
await stage("tests", () => run("npm", ["run", "test"], appRoot));
await stage("production build", () => run("npm", ["run", "build"], appRoot));

if (staticOnly) {
  console.log("[SKIP] Docker build/run: --static was selected. Run the full command on a Docker host before deployment.");
  process.exit(0);
}

await stage("Docker availability", () => run("docker", ["version"], appRoot));
const image = "scenario-qa-app:northflank-preflight";
const container = `scenario-qa-preflight-${Date.now()}`;
await stage("Docker build", () => run("docker", ["build", "-f", "scenario-qa-app/Dockerfile", "-t", image, "."], repositoryRoot));

try {
  await stage("Docker run", () => run("docker", [
    "run", "-d", "--name", container, "--shm-size=256m", "-p", "127.0.0.1:3917:3000",
    "-e", "NODE_ENV=production", "-e", "HOST=0.0.0.0", "-e", "PORT=3000",
    "-e", "APP_BASE_URL=https://northflank-preflight.invalid", "-e", "NUXT_STORAGE_ROOT=/app/storage",
    "-e", "APP_DEPLOYMENT_MODE=preflight", "-e", "APP_AUTH_ENABLED=false",
    "-e", "ALLOW_LOCAL_TEST_TARGETS=false", "-e", "TEST_SCHEDULER_ENABLED=false", image
  ], appRoot));
  await stage("health/readiness", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const live = await fetch("http://127.0.0.1:3917/api/health/live").catch(() => null);
      const ready = await fetch("http://127.0.0.1:3917/api/health/ready").catch(() => null);
      if (live?.ok && ready?.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("NORTHFLANK_HEALTH_CHECK_FAILED: health/readiness timeout");
  });
  await stage("Chromium launch", () => run("docker", ["exec", container, "node", "--input-type=module", "-e",
    "import{chromium}from'./.output/server/node_modules/playwright/index.mjs';const b=await chromium.launch({headless:true});const p=await b.newPage();await p.setContent('<h1>northflank-ok</h1>');if(await p.textContent('h1')!=='northflank-ok')process.exit(1);await b.close();"
  ], appRoot));
  await stage("resource snapshot", () => run("docker", ["stats", "--no-stream", container], appRoot));
} finally {
  spawnSync("docker", ["rm", "-f", container], { cwd: appRoot, stdio: "ignore", shell: process.platform === "win32" });
}

console.log("Northflank preflight passed.");

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32", env: process.env });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
}

async function stage(name: string, task: () => void | Promise<void>): Promise<void> {
  console.log(`\n[START] ${name}`);
  await task();
  console.log(`[PASS] ${name}`);
}
