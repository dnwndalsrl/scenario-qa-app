import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../assets/scss/main.scss", import.meta.url), "utf8");

describe("Badge 레이아웃", () => {
  it("카드 헤더에서 Badge가 세로로 늘어나지 않는다", () => {
    expect(styles).toMatch(/\.test-card__head\s*\{[^}]*align-items:\s*flex-start/);
  });
});
