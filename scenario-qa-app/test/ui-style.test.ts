import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../assets/scss/main.scss", import.meta.url), "utf8");
const layout = readFileSync(new URL("../layouts/default.vue", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/login.vue", import.meta.url), "utf8");

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

  it("설정된 심사용 계정을 로그인 입력란에 채울 수 있다", () => {
    expect(login).toContain('v-if="reviewerAccountAvailable"');
    expect(login).toContain('class="reviewer-account"');
    expect(login).toContain('@click="fillReviewerAccount"');
    expect(login).not.toContain("qa-admin@scenario-qa.app");
  });
});
