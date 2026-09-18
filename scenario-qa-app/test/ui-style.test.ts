import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../assets/scss/main.scss", import.meta.url), "utf8");
const layout = readFileSync(new URL("../layouts/default.vue", import.meta.url), "utf8");
const login = readFileSync(new URL("../pages/login.vue", import.meta.url), "utf8");

describe("Badge 레이아웃", () => {
  it("카드 헤더에서 Badge가 세로로 늘어나지 않는다", () => {
    expect(styles).toMatch(/\.test-card__head\s*\{[^}]*align-items:\s*flex-start/);
  });

  it("홈 사용 현황을 전체 너비의 세로 목록으로 표시한다", () => {
    expect(styles).toMatch(/\.usage-summary\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr/);
    expect(styles).toMatch(/\.usage-summary span\s*\{[^}]*width:\s*100%/);
  });

  it("키보드 탐색과 모션 축소 환경을 지원한다", () => {
    expect(layout).toContain('class="skip-link"');
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("로그인 입력란에 명시적인 레이블을 연결한다", () => {
    expect(login).toContain('for="login-email"');
    expect(login).toContain('id="login-email"');
    expect(login).toContain('for="login-password"');
    expect(login).toContain('id="login-password"');
  });
});

