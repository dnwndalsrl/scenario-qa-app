import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GeneratedTestScenario, PageSnapshot } from "../../shared/types/analysis";
import { collectPage } from "./page-collector";
import { executeGeneratedTests, readStableActualValue } from "./test-executor";

const fixtureUrl = "http://127.0.0.1:3011";
const storageRoot = path.resolve(process.cwd(), "test/.tmp-analysis-storage");
let fixture: ChildProcess;
let snapshot: PageSnapshot;
let stateSnapshot: PageSnapshot;

beforeAll(async () => {
  process.env.ALLOW_LOCAL_TEST_TARGETS = "true"; process.env.ALLOWED_LOCAL_TEST_PORTS = "3011"; process.env.NUXT_STORAGE_ROOT = storageRoot; process.env.FIXTURE_PORT = "3011";
  fixture = spawn(process.execPath, ["test/fixtures/site/server.mjs"], { cwd: process.cwd(), env: process.env, stdio: "ignore", windowsHide: true });
  for (let count = 0; count < 40; count += 1) { if (await fetch(`${fixtureUrl}/health`).then((response) => response.ok).catch(() => false)) break; await new Promise((resolve) => setTimeout(resolve, 100)); }
  snapshot = await collectPage("analysis-fixture", fixtureUrl, { width: 1440, height: 900 }, 15000);
  stateSnapshot = await collectPage("analysis-fixture", `${fixtureUrl}/state`, { width: 1440, height: 900 }, 15000);
});
afterAll(async () => { fixture?.kill(); await rm(storageRoot, { recursive: true, force: true }); });

describe("Playwright 페이지 수집과 실행", () => {
  it("visible 요소, 접근성 정보, locator 유일성, 문제와 스크린샷을 수집한다", () => {
    expect(snapshot.title).toBe("Probe QA Fixture"); expect(snapshot.elements.length).toBeGreaterThan(10);
    expect(snapshot.elements.some((element) => element.text === "숨겨진 버튼")).toBe(false);
    expect(snapshot.elements.some((element) => element.testId === "ancestor-hidden-link")).toBe(false);
    expect(snapshot.elements.find((element) => element.testId === "covered-link")?.actionable).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("never-collect-this");
    const info = snapshot.elements.find((element) => element.testId === "info-button");
    expect(info?.locatorCandidates[0]).toMatchObject({ strategy: "test_id", value: "info-button", unique: true });
    expect(stateSnapshot.elements.find((element) => element.testId === "accordion-button")?.stateAttributes).toMatchObject({ "aria-expanded": "false", "aria-controls": "accordion-panel" });
    const overlayLink = snapshot.elements.find((element) => element.href?.endsWith("/smartfarm/system/"));
    expect(overlayLink).toMatchObject({ type: "link", accessibleName: "Smart-Farm 시스템", actionable: true });
    expect(overlayLink?.locatorCandidates).toContainEqual(expect.objectContaining({ strategy: "css", value: 'a[href$="/smartfarm/system/"]' }));
    expect(snapshot.screenshotArtifactId).toMatch(/^artifact-/);
    expect(snapshot.consoleMessages.some((item) => item.type === "warning")).toBe(true);
    expect(snapshot.networkIssues.some((item) => item.status === 404)).toBe(true);
  });

  it("초기·하향·상향 스크롤 상태를 수집하고 동적 요소의 노출 시점을 보존한다", () => {
    expect(snapshot.stateObservations?.map((item) => item.state)).toEqual([
      "initial", "scroll_25", "scroll_50", "scroll_75", "scroll_100", "scroll_up", "restored_top"
    ]);

    const lazyHeading = snapshot.elements.find((element) => element.testId === "lazy-heading");
    expect(lazyHeading).toBeDefined();
    expect(lazyHeading?.observedStates).not.toContain("initial");
    expect(lazyHeading?.observedStates?.some((state) => state === "scroll_75" || state === "scroll_100")).toBe(true);

    const dynamicHeaderLink = snapshot.elements.find((element) => element.testId === "product-link");
    expect(dynamicHeaderLink?.inViewportStates).toContain("initial");
    expect(dynamicHeaderLink?.inViewportStates).not.toContain("scroll_25");
    expect(dynamicHeaderLink?.inViewportStates).toContain("scroll_up");
    expect(dynamicHeaderLink?.inViewportStates).toContain("restored_top");
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
    expect(runs[1]?.failureKind).toBe("product_defect");
    expect(runs[1]?.stepResults[1]?.failureKind).toBe("product_defect");
    expect(runs[1]?.screenshotArtifactIds.length).toBeGreaterThan(0);
    expect(runs[2]?.error?.code).toBe("TEST_SAFETY_BLOCKED");
    expect(runs[2]?.failureKind).toBe("safety_blocked");
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

  it("does not scroll the page while asserting that a deep element is already in the viewport", async () => {
    const target = snapshot.elements.find((element) => element.text === "상품 소개")!;
    const locator = target.locatorCandidates.find((item) => item.unique)!;
    const scenario = makeScenario("pure-viewport-assertion", [
      { action: "goto", description: "페이지 접속" },
      { action: "assert_in_viewport", description: "스크롤 없이 상품 소개 노출 확인", elementId: target.id, locator, timeoutMs: 1000 }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("failed");
    expect(run?.failureKind).toBe("product_defect");
    expect(run?.stepResults[1]?.errorMessage).toContain("화면 영역으로 이동하지 않았습니다");
  });

  it("falls back to another captured locator for the same element", async () => {
    const target = snapshot.elements.find((element) => element.testId === "info-button")!;
    const scenario = makeScenario("locator-fallback", [{
      action: "assert_visible",
      description: "대체 locator로 정보 버튼 표시 확인",
      elementId: target.id,
      locator: { strategy: "test_id", value: "stale-info-button", score: 100, unique: true },
      timeoutMs: 1000
    }]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("success");
    expect(run?.stepResults[0]?.locatorUsed).toMatchObject({ strategy: "test_id", value: "info-button" });
  });

  it("classifies an unresolved locator as an automation limitation instead of a product defect", async () => {
    const scenario = makeScenario("missing-locator", [{
      action: "assert_visible",
      description: "존재하지 않는 locator 확인",
      locator: { strategy: "test_id", value: "missing-target", score: 100, unique: true },
      timeoutMs: 1000
    }]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status).toBe("error");
    expect(run?.failureKind).toBe("automation_limit");
    expect(run?.stepResults[0]?.failureKind).toBe("automation_limit");
  });

  it("reveals a fixed header after downward scrolling before clicking its link", async () => {
    const productLink = snapshot.elements.find((element) => element.testId === "product-link")!;
    const scenario = makeScenario("dynamic-header", [
      { action: "scroll_to_ratio", description: "헤더가 숨겨지는 위치로 스크롤", value: "75" },
      { action: "scroll_by", description: "헤더를 다시 표시하도록 위로 스크롤", value: "-240" },
      { action: "wait_for_stable", description: "동적 헤더 위치 안정화", elementId: productLink.id, locator: productLink.locatorCandidates.find((item) => item.unique)!, value: "150" },
      { action: "click", description: "Product 링크 클릭", elementId: productLink.id, locator: productLink.locatorCandidates.find((item) => item.unique)! },
      { action: "assert_url", description: "상품 목록 이동 확인", expected: "/products" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[0]?.actual).toContain("스크롤 위치");
    expect(run?.stepResults[1]?.actual).toContain("스크롤 이벤트");
    expect(run?.stepResults[4]?.currentUrl).toContain("/products");
  });

  it("requires a hash-link click to reach its expected section", async () => {
    const link = snapshot.elements.find((element) => element.testId === "features-link")!;
    const scenario = makeScenario("section-scroll", [
      { action: "click", description: "기능 보기 클릭", elementId: link.id, locator: link.locatorCandidates.find((item) => item.unique)! },
      { action: "assert_scroll", description: "기능 섹션 도달 확인", expected: "#features" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[1]).toMatchObject({ expected: "#features", status: "success" });
    expect(run?.stepResults[1]?.actual).toContain("스크롤 이벤트");
  });

  it("rechecks click actionability across scroll states when a fixed-header link is transiently covered", async () => {
    const link = snapshot.elements.find((element) => element.testId === "transient-header-link")!;
    const scenario = makeScenario("transient-header-cover", [
      { action: "wait_for_stable", description: "동적 헤더 위치 안정화", elementId: link.id, locator: link.locatorCandidates.find((item) => item.unique)!, value: "150" },
      { action: "click", description: "Dr. AG 링크 클릭", elementId: link.id, locator: link.locatorCandidates.find((item) => item.unique)! },
      { action: "assert_url", description: "회사 소개 이동 확인", expected: "/about" }
    ]);

    expect(link.actionable).toBe(true);
    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/about");
  });

  it("clicks the exact DOM target when a moving menu cannot satisfy locator stability", async () => {
    const link = snapshot.elements.find((element) => element.testId === "moving-header-link")!;
    const scenario = makeScenario("moving-header-link", [
      { action: "click", description: "움직이는 메뉴 클릭", elementId: link.id, locator: link.locatorCandidates.find((item) => item.unique)!, timeoutMs: 2500 },
      { action: "assert_url", description: "회사 소개 이동 확인", expected: "/about" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[1]?.currentUrl).toContain("/about");
  });

  it("reproduces a lazy-loaded counter state and waits for its final value", async () => {
    const counter = snapshot.elements.find((element) => element.testId === "counter-value")!;
    const lazyHeading = snapshot.elements.find((element) => element.testId === "lazy-heading")!;
    const counterLocator = counter.locatorCandidates.find((item) => item.unique)!;
    const scenario = makeScenario("lazy-counter", [
      { action: "goto", description: "페이지 접속" },
      { action: "scroll_to_ratio", description: "지연 콘텐츠가 생성되는 상태 재현", value: "100" },
      { action: "wait_for_stable", description: "카운터 애니메이션 종료 대기", elementId: counter.id, locator: counterLocator, value: "300" },
      { action: "assert_text", description: "최종 카운터 값 확인", elementId: counter.id, locator: counterLocator, expected: "32000" },
      { action: "assert_visible", description: "지연 로딩 제목 확인", elementId: lazyHeading.id, locator: lazyHeading.locatorCandidates.find((item) => item.unique)! }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.actual).toContain("32000");
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

  it("uses the single visible match when a locator also matches a hidden clone", async () => {
    const scenario = makeScenario("visible-locator-match", [
      { action: "goto", description: "페이지 접속" },
      { action: "click", description: "표시된 Product 링크 클릭", locator: { strategy: "text", value: "Product", score: 60, unique: true } },
      { action: "assert_url", description: "상품 페이지 이동 확인", expected: "/products" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/products");
  });

  it("retries a non-unique snapshot candidate and selects its single visible match", async () => {
    const productLink = snapshot.elements.find((element) => element.testId === "product-link")!;
    const fallbackSnapshot = {
      ...snapshot,
      elements: snapshot.elements.map((element) => element.id === productLink.id
        ? { ...element, locatorCandidates: [{ strategy: "text" as const, value: "Product", score: 60, unique: false }] }
        : element)
    };
    const scenario = makeScenario("visible-snapshot-fallback", [
      { action: "goto", description: "페이지 접속" },
      { action: "click", description: "표시된 Product 링크 클릭", elementId: productLink.id },
      { action: "assert_url", description: "상품 페이지 이동 확인", expected: "/products" }
    ]);

    const [run] = await executeGeneratedTests(fallbackSnapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/products");
  });

  it("clicks an equivalent overlay link when duplicated card headings share one destination", async () => {
    const scenario = makeScenario("equivalent-card-links", [
      { action: "goto", description: "페이지 접속" },
      { action: "click", description: "Smart-Farm 시스템 카드 클릭", locator: { strategy: "text", value: "Smart-Farm 시스템", score: 60, unique: false } },
      { action: "assert_url", description: "Smart-Farm 상세 이동 확인", expected: "/smartfarm/system/" }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.currentUrl).toContain("/smartfarm/system/");
  });

  it("falls back to page-level stability when no target element is supplied", async () => {
    const lazyHeading = snapshot.elements.find((element) => element.testId === "lazy-heading")!;
    const scenario = makeScenario("page-stability-fallback", [
      { action: "goto", description: "페이지 접속" },
      { action: "scroll_to_ratio", description: "지연 콘텐츠 위치로 스크롤", value: "100" },
      { action: "wait_for_stable", description: "사라진 대상 대신 페이지 콘텐츠 안정화 대기", locator: { strategy: "test_id", value: "missing-dynamic-target", score: 100, unique: true }, value: "300" },
      { action: "assert_visible", description: "지연 로딩 제목 확인", elementId: lazyHeading.id, locator: lazyHeading.locatorCandidates.find((item) => item.unique)! }
    ]);

    const [run] = await executeGeneratedTests(snapshot, [scenario]);

    expect(run?.status, JSON.stringify(run?.stepResults)).toBe("success");
    expect(run?.stepResults[2]?.actual).toBe("페이지 콘텐츠 안정화 확인");
  });

  it("keeps a successful stability wait when its dynamic target disappears before result recording", async () => {
    const page = { getByTestId: () => ({ innerText: () => Promise.reject(new Error("detached")) }) } as never;
    const actual = await readStableActualValue(page, { strategy: "test_id", value: "removed-target", score: 100, unique: true });

    expect(actual).toBe("페이지 콘텐츠 안정화 확인");
  });

  it("verifies attribute, hidden, value, and count outcomes after safe UI interactions", async () => {
    const accordion = stateSnapshot.elements.find((element) => element.testId === "accordion-button")!;
    const close = stateSnapshot.elements.find((element) => element.testId === "notice-close")!;
    const valueChange = stateSnapshot.elements.find((element) => element.testId === "value-change")!;
    const value = stateSnapshot.elements.find((element) => element.testId === "status-value")!;
    const add = stateSnapshot.elements.find((element) => element.testId === "item-add")!;
    const locator = (element: typeof accordion) => element.locatorCandidates.find((item) => item.unique)!;
    const scenarios = [
      makeScenario("attribute-state", [
        { action: "click", description: "상세 정보 열기", elementId: accordion.id, locator: locator(accordion) },
        { action: "assert_attribute", description: "확장 상태 확인", elementId: accordion.id, locator: locator(accordion), value: "aria-expanded", expected: "true" }
      ]),
      makeScenario("hidden-state", [
        { action: "click", description: "안내 닫기", elementId: close.id, locator: locator(close) },
        { action: "assert_hidden", description: "안내 숨김 확인", locator: { strategy: "test_id", value: "state-notice", score: 100, unique: true } }
      ]),
      makeScenario("value-state", [
        { action: "click", description: "값 변경", elementId: valueChange.id, locator: locator(valueChange) },
        { action: "assert_value", description: "변경 값 확인", elementId: value.id, locator: locator(value), expected: "완료" }
      ]),
      makeScenario("count-state", [
        { action: "click", description: "항목 추가", elementId: add.id, locator: locator(add) },
        { action: "assert_count", description: "항목 개수 확인", locator: { strategy: "css", value: "#state-items li", score: 70, unique: false }, expected: "3" }
      ]),
      makeScenario("attribute-mismatch", [
        { action: "click", description: "상세 정보 열기", elementId: accordion.id, locator: locator(accordion) },
        { action: "assert_attribute", description: "잘못된 확장 상태 예상", elementId: accordion.id, locator: locator(accordion), value: "aria-expanded", expected: "false" }
      ])
    ];

    const runs = await executeGeneratedTests(stateSnapshot, scenarios);

    expect(runs.map((run) => run.status), JSON.stringify(runs)).toEqual(["success", "success", "success", "success", "failed"]);
    expect(runs[0]?.stepResults[0]?.actual).toContain("aria-expanded=false → aria-expanded=true");
    expect(runs[0]?.stepResults[1]).toMatchObject({ expected: "true", actual: "true" });
    expect(runs[1]?.stepResults[1]).toMatchObject({ expected: "대상 요소가 숨겨짐", actual: "숨김 상태 확인" });
    expect(runs[2]?.stepResults[1]).toMatchObject({ expected: "완료", actual: "완료" });
    expect(runs[3]?.stepResults[1]).toMatchObject({ expected: "3", actual: "3" });
    expect(runs[4]).toMatchObject({ failureKind: "product_defect", stepResults: [expect.any(Object), expect.objectContaining({ expected: "false", actual: "true", status: "failed" })] });
  });

  it("blocks reading a password value even when a scenario is marked safe", async () => {
    const password = snapshot.elements.find((element) => element.inputType === "password")!;
    const [run] = await executeGeneratedTests(snapshot, [makeScenario("password-value", [{ action: "assert_value", description: "비밀번호 값 확인", elementId: password.id, locator: password.locatorCandidates.find((item) => item.unique)!, expected: "secret" }])]);

    expect(run).toMatchObject({ status: "blocked", failureKind: "safety_blocked" });
  });
});

function makeScenario(id: string, steps: Array<Partial<GeneratedTestScenario["steps"][number]> & Pick<GeneratedTestScenario["steps"][number], "action" | "description">>): GeneratedTestScenario {
  return { id: `test-${id}`, analysisId: snapshot.analysisId, title: id, description: id, purpose: id, category: "visibility", safetyLevel: "safe", safetyReasons: [], confidence: .9, autoExecutable: true, sourceElementIds: steps.map((step) => step.elementId).filter((value): value is string => Boolean(value)), steps: steps.map((step, index) => ({ id: `step-${id}-${index}`, order: index + 1, evidence: [], ...step })), generatedAt: new Date().toISOString() };
}
