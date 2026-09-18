import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../assets/scss/main.scss", import.meta.url), "utf8");
const layout = readFileSync(new URL("../layouts/default.vue", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/login.vue", import.meta.url), "utf8");
const entry = readFileSync(new URL("../pages/index.vue", import.meta.url), "utf8");
const functionalSettings = readFileSync(new URL("../components/analysis/UrlAnalysisForm.vue", import.meta.url), "utf8");
const uiSettings = readFileSync(new URL("../components/analysis/UiAuditForm.vue", import.meta.url), "utf8");
const analysisDetail = readFileSync(new URL("../pages/analyses/[analysisId].vue", import.meta.url), "utf8");
const running = readFileSync(new URL("../components/analysis/AnalysisRunningView.vue", import.meta.url), "utf8");

describe("Badge 레이아웃", () => {
  it("카드 헤더에서 Badge가 세로로 늘어나지 않는다", () => {
    expect(styles).toMatch(/\.test-card__head\s*\{[^}]*align-items:\s*flex-start/);
  });

  it("1440px 레퍼런스 레이아웃을 유지하고 작은 화면에서는 가로 스크롤한다", () => {
    expect(styles).toMatch(/html\s*\{[^}]*min-width:\s*1440px[^}]*overflow-x:\s*auto/);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*min-width:\s*1440px/);
  });

  it("레퍼런스의 로컬 폰트와 단색 토큰을 사용한다", () => {
    expect(styles).toContain("Pretendard-Regular.woff2");
    expect(styles).toContain("jetbrains-mono-latin-400-normal.woff2");
    expect(styles).toContain("--ink:#0a0a0a");
    expect(styles).toContain("--bg:#fff");
  });

  it("키보드 탐색과 모션 축소 환경을 지원한다", () => {
    expect(layout).toContain('class="skip-link"');
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("로그인 입력란에 명시적인 레이블을 연결한다", () => {
    expect(login).toContain("<form novalidate");
    expect(login).toContain('for="login-email"');
    expect(login).toContain('id="login-email"');
    expect(login).toContain('for="login-password"');
    expect(login).toContain('id="login-password"');
  });

  it("로그인 레퍼런스의 문구와 보조 요소를 제공한다", () => {
    expect(login).toContain("분석 요청과 비공개 QA 결과에 접근합니다.");
    expect(login).toContain('placeholder="name@company.com"');
    expect(login).toContain('placeholder="••••••••"');
    expect(login).toContain("비밀번호를 잊으셨나요?");
    expect(login).toContain("심사 기간에만 제공되는 공용 계정입니다. 외부에 공유하지 마세요.");
    expect(login).toContain("로그인 정보가 올바르지 않습니다");
    expect(login).toContain("이메일과 비밀번호를 다시 확인해 주세요.");
  });

  it("설정된 심사용 계정을 로그인 입력란에 채울 수 있다", () => {
    expect(login).toContain('v-if="reviewerAccountAvailable"');
    expect(login).toContain('class="reviewer-account"');
    expect(login).toContain('@click="fillReviewerAccount"');
    expect(login).not.toContain("qa-admin@scenario-qa.app");
  });

  it("메인 진입 시 기능 QA를 기본으로 선택하고 지정된 제목을 표시한다", () => {
    expect(entry).toContain('ref<"functional" | "ui">("functional")');
    expect(entry).toContain("어떤 페이지를 검증할까요?");
    expect(entry).toContain("<UrlAnalysisForm v-if=\"analysisMode === 'functional'\"");
  });

  it("기능 QA와 UI 점검에 각각의 실행 전 설정을 제공한다", () => {
    expect(functionalSettings).toContain("실행 전 설정");
    expect(functionalSettings).toContain("1 선택 문서 분석 → 2 페이지·시나리오 분석 → 3 확정 시나리오 실행");
    expect(uiSettings).toContain("실행 전 설정");
    expect(uiSettings).toContain("1 점검 대상 등록 → 2 화면·UI 규칙 수집 → 3 디자인 비교 보고서");
  });

  it("진행 중인 기능 분석은 M04 전용 진행 화면으로 전환한다", () => {
    expect(analysisDetail).toContain("<AnalysisRunningView");
    expect(analysisDetail).toContain("showRunningView");
    expect(running).toContain("분석 중입니다");
    expect(running).toContain("AI 페이지 기능 분석");
    expect(running).toContain("QA 보고서 생성");
  });
});
