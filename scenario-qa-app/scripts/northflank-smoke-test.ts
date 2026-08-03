import { chromium, request } from "playwright";

const baseUrl = required("NORTHFLANK_PUBLIC_URL").replace(/\/$/, "");
const username = required("SMOKE_TEST_USERNAME");
const password = required("SMOKE_TEST_PASSWORD");
const targetUrl = process.env.SMOKE_TEST_TARGET_URL || "https://example.com";
const preserveProject = process.env.SMOKE_PRESERVE_PROJECT === "true";
const terminalStatuses = new Set(["success", "failed", "blocked", "error"]);

if (!baseUrl.startsWith("https://")) fail("NORTHFLANK_PUBLIC_ENDPOINT_FAILED", "공개 URL은 HTTPS여야 합니다.");

const publicRequest = await request.newContext();
const live = await publicRequest.get(`${baseUrl}/api/health/live`);
if (!live.ok()) fail("NORTHFLANK_HEALTH_CHECK_FAILED", `liveness가 HTTP ${live.status()}를 반환했습니다.`);
const protectedApi = await publicRequest.get(`${baseUrl}/api/projects`);
if (protectedApi.status() !== 401) fail("NORTHFLANK_PUBLIC_ENDPOINT_FAILED", `비인증 API가 HTTP ${protectedApi.status()}를 반환했습니다(예상 401).`);
await publicRequest.dispose();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
let projectId: string | undefined;

try {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/projects"), { timeout: 20_000 }),
    page.getByRole("button", { name: "로그인" }).click()
  ]);
  if ((await page.locator("script[src*='/_nuxt/']").count()) < 1) fail("NORTHFLANK_PUBLIC_ENDPOINT_FAILED", "Nuxt 정적 asset을 확인하지 못했습니다.");

  const project = await api("/api/projects", {
    method: "POST",
    body: {
      name: `Northflank smoke ${Date.now()}`,
      description: "Automated deployment smoke test",
      baseUrl: targetUrl,
      environmentName: "northflank-sandbox",
      defaultTimeout: 30_000,
      stopOnFailure: true
    }
  });
  projectId = String(project.id);

  const successScenario = await createScenario(projectId, "Northflank Chromium success", "Example Domain");
  const successRun = await runAndWait(projectId, String(successScenario.id));
  if (successRun.run.status !== "success") fail("NORTHFLANK_CHROMIUM_START_FAILED", `성공 smoke 시나리오 상태: ${successRun.run.status}`);
  if (successRun.result?.browserInfo?.name !== "chromium") fail("NORTHFLANK_CHROMIUM_START_FAILED", "실행 결과에 Chromium 정보가 없습니다.");

  const failureScenario = await createScenario(projectId, "Northflank screenshot failure", "This heading must not exist");
  const failureRun = await runAndWait(projectId, String(failureScenario.id));
  if (failureRun.run.status !== "failed") fail("NORTHFLANK_DEPLOY_FAILED", `실패 smoke 시나리오 상태: ${failureRun.run.status}`);
  const artifactId = failureRun.result?.steps.find((step: any) => step.screenshotArtifactId)?.screenshotArtifactId;
  if (!artifactId) fail("NORTHFLANK_DEPLOY_FAILED", "실패 스크린샷 artifact ID가 없습니다.");
  const artifactStatus = await page.evaluate(async ({ runId, artifactId }) => {
    const response = await fetch(`/api/test-runs/${runId}/artifacts/${artifactId}`);
    return { status: response.status, contentType: response.headers.get("content-type") };
  }, { runId: failureRun.run.id, artifactId });
  if (artifactStatus.status !== 200 || !artifactStatus.contentType?.includes("image/png")) fail("NORTHFLANK_DEPLOY_FAILED", "실패 스크린샷을 인증 세션으로 조회하지 못했습니다.");

  await page.goto(`${baseUrl}/system/status`, { waitUntil: "domcontentloaded" });
  if (!(await page.getByRole("heading", { name: "운영 상태" }).isVisible())) fail("NORTHFLANK_PUBLIC_ENDPOINT_FAILED", "운영 상태 화면을 확인하지 못했습니다.");

  console.log(JSON.stringify({
    status: "passed",
    publicUrl: baseUrl,
    projectId,
    successRunId: successRun.run.id,
    successStatus: successRun.run.status,
    browser: successRun.result.browserInfo,
    failureRunId: failureRun.run.id,
    failureStatus: failureRun.run.status,
    screenshotAccessible: true,
    projectPreserved: preserveProject
  }, null, 2));
} finally {
  if (projectId && !preserveProject) await api(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

async function createScenario(project: string, name: string, heading: string): Promise<any> {
  return api(`/api/projects/${project}/scenarios`, {
    method: "POST",
    body: {
      name,
      startUrl: "/",
      stopOnFailure: true,
      timeout: 30_000,
      steps: [
        { id: "step-goto", order: 1, name: "공개 페이지 이동", action: "goto", value: "/", timeout: 20_000, required: true },
        { id: "step-heading", order: 2, name: "제목 확인", action: "assert_visible", target: { strategy: "role", value: "heading", name: heading, exact: true }, timeout: 10_000, required: true }
      ]
    }
  });
}

async function runAndWait(project: string, scenarioId: string): Promise<any> {
  const accepted = await api("/api/test-runs", { method: "POST", body: { projectId: project, scenarioId } });
  for (let poll = 0; poll < 180; poll += 1) {
    const detail = await api(`/api/test-runs/${accepted.runId}`);
    if (terminalStatuses.has(detail.run.status)) return detail;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  fail("NORTHFLANK_HEALTH_CHECK_FAILED", "Playwright 실행이 제한 시간 안에 완료되지 않았습니다.");
}

async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const result = await page.evaluate(async ({ path, method, body }) => {
    const requestInit: RequestInit = body === undefined
      ? { method }
      : {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        };
    const response = await fetch(path, requestInit);
    const payload = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, payload };
  }, { path, method: init.method ?? "GET", body: init.body });
  if (!result.ok || result.payload?.success === false) {
    throw new Error(`${result.status} ${result.payload?.error?.code ?? "NORTHFLANK_API_ERROR"}`);
  }
  return result.payload?.data ?? result.payload;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail("NORTHFLANK_ENVIRONMENT_INVALID", `${name} 환경변수가 필요합니다.`);
  return value;
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}
