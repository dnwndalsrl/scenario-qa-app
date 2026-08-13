import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { collectPage } from "./page-collector";
import { executeGeneratedTests } from "./test-executor";

const fixtureUrl = "http://127.0.0.1:3011";
const storageRoot = path.resolve(process.cwd(), "test/.tmp-analysis-storage");
let fixture: ChildProcess;
let snapshot: PageSnapshot;

beforeAll(async () => {
  process.env.ALLOW_LOCAL_TEST_TARGETS = "true"; process.env.ALLOWED_LOCAL_TEST_PORTS = "3011"; process.env.NUXT_STORAGE_ROOT = storageRoot; process.env.FIXTURE_PORT = "3011";
  fixture = spawn(process.execPath, ["test/fixtures/site/server.mjs"], { cwd: process.cwd(), env: process.env, stdio: "ignore", windowsHide: true });
  for (let count = 0; count < 40; count += 1) { if (await fetch(`${fixtureUrl}/health`).then((response) => response.ok).catch(() => false)) break; await new Promise((resolve) => setTimeout(resolve, 100)); }
  snapshot = await collectPage("analysis-fixture", fixtureUrl, { width: 1440, height: 900 }, 15000);
});
afterAll(async () => { fixture?.kill(); await rm(storageRoot, { recursive: true, force: true }); });

describe("Playwright 페이지 수집과 실행", () => {
  it("visible 요소, 접근성 정보, locator 유일성, 문제와 스크린샷을 수집한다", () => {
    expect(snapshot.title).toBe("Probe QA Fixture"); expect(snapshot.elements.length).toBeGreaterThan(10);
    expect(snapshot.elements.some((element) => element.text === "숨겨진 버튼")).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("never-collect-this");
    const info = snapshot.elements.find((element) => element.testId === "info-button");
    expect(info?.locatorCandidates[0]).toMatchObject({ strategy: "test_id", value: "info-button", unique: true });
    expect(snapshot.screenshotArtifactId).toMatch(/^artifact-/);
    expect(snapshot.consoleMessages.some((item) => item.type === "warning")).toBe(true);
    expect(snapshot.networkIssues.some((item) => item.status === 404)).toBe(true);
  });

  it("safe 테스트만 실행하고 실패·차단·증거 상태를 구분한다", async () => {
    const h1 = snapshot.elements.find((element) => element.type === "heading" && element.text === "안전한 QA Fixture")!;
    const danger = snapshot.elements.find((element) => element.testId === "delete-button")!;
    const tests: GeneratedTestScenario[] = [
      makeScenario("success", [{ action: "goto", description: "페이지 이동" }, { action: "assert_visible", description: "제목 표시", elementId: h1.id, locator: h1.locatorCandidates.find((item) => item.unique)! }]),
      makeScenario("failed", [{ action: "goto", description: "페이지 이동" }, { action: "assert_text", description: "잘못된 제목 예상", elementId: h1.id, locator: h1.locatorCandidates.find((item) => item.unique)!, expected: "존재하지 않는 제목" }]),
      makeScenario("danger", [{ action: "click", description: "계정 삭제", elementId: danger.id, locator: danger.locatorCandidates.find((item) => item.unique)! }])
    ];
    const runs = await executeGeneratedTests(snapshot, tests);
    expect(runs.map((run) => run.status)).toEqual(["success", "failed", "blocked"]);
    expect(runs[1]?.screenshotArtifactIds.length).toBeGreaterThan(0);
    expect(runs[2]?.error?.code).toBe("TEST_SAFETY_BLOCKED");
  });

  it("navigates to the captured page before a scenario without a goto step", async () => {
    const target = snapshot.elements.find((element) => element.locatorCandidates.some((item) => item.unique))!;
    const scenario = makeScenario("implicit-navigation", [{
      action: "assert_visible",
      description: "captured heading is visible",
      elementId: target.id,
      locator: target.locatorCandidates.find((item) => item.unique)!
    }]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("success");
    expect(run?.stepResults[0]?.currentUrl).toBe(snapshot.finalUrl);
  });

  it("tracks a same-page link scroll and verifies that the target section enters the viewport", async () => {
    const link = snapshot.elements.find((element) => element.testId === "features-link")!;
    const targetId = snapshot.headings.find((heading) => heading.level === 2)?.elementId!;
    const target = snapshot.elements.find((element) => element.id === targetId)!;
    const scenario = makeScenario("section-scroll", [
      { action: "click", description: "섹션 링크 클릭", elementId: link.id, locator: link.locatorCandidates.find((item) => item.unique)! },
      { action: "assert_in_viewport", description: "목표 섹션 화면 내 도달 확인", elementId: target.id, locator: target.locatorCandidates.find((item) => item.unique)! }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("success");
    expect(run?.stepResults[1]?.actual).toContain("스크롤 이벤트");
    expect(run?.stepResults[1]?.currentUrl).toBe(snapshot.finalUrl);
  });

  it("scrolls to a deep element before checking that it is in the viewport", async () => {
    const target = snapshot.elements.find((element) => element.text === "상품 소개")!;
    const locator = target.locatorCandidates.find((item) => item.unique)!;
    const scenario = makeScenario("explicit-scroll", [
      { action: "goto", description: "페이지 접속" },
      { action: "scroll_into_view", description: "상품 소개로 스크롤", elementId: target.id, locator },
      { action: "assert_in_viewport", description: "상품 소개 화면 내 표시 확인", elementId: target.id, locator }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("success");
    expect(run?.stepResults[1]?.actual).toContain("대상으로 스크롤");
    expect(run?.stepResults[2]?.actual).toContain("화면 내 도달");
  });

  it("reveals a fixed header after downward scrolling before clicking its link", async () => {
    const deepTarget = snapshot.elements.find((element) => element.text === "상품 소개")!;
    const productLink = snapshot.elements.find((element) => element.testId === "product-link")!;
    const scenario = makeScenario("dynamic-header", [
      { action: "scroll_into_view", description: "헤더가 숨겨지는 위치로 스크롤", elementId: deepTarget.id, locator: deepTarget.locatorCandidates.find((item) => item.unique)! },
      { action: "click", description: "Product 링크 클릭", elementId: productLink.id, locator: productLink.locatorCandidates.find((item) => item.unique)! },
      { action: "assert_url", description: "상품 목록 이동 확인", expected: "/products" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/products");
  });

  it("waits for a locator that is attached after DOMContentLoaded", async () => {
    const scenario = makeScenario("late-locator", [
      { action: "goto", description: "페이지 접속" },
      { action: "click", description: "지연 링크 클릭", locator: { strategy: "test_id", value: "late-link", score: 100, unique: true } },
      { action: "assert_url", description: "지연 링크 이동 확인", expected: "/about" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/about");
  });
});

function makeScenario(id: string, steps: Array<Partial<GeneratedTestScenario["steps"][number]> & Pick<GeneratedTestScenario["steps"][number], "action" | "description">>): GeneratedTestScenario {
  return { id: `test-${id}`, analysisId: snapshot.analysisId, title: id, description: id, purpose: id, category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: steps.map((step) => step.elementId).filter((value): value is string => Boolean(value)), steps: steps.map((step, index) => ({ id: `step-${id}-${index}`, order: index + 1, evidence: [], ...step })), generatedAt: new Date().toISOString() };
}
