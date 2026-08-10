import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../", import.meta.url);

describe("스크린샷 API 배포", () => {
  it("API 라우트 디렉터리를 Git ignore 대상에서 제외한다", () => {
    const ignoreLines = readFileSync(new URL(".gitignore", projectRoot), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim());

    expect(ignoreLines).toContain("/artifacts/");
    expect(ignoreLines).not.toContain("artifacts/");
    expect(existsSync(new URL("server/api/analyses/[analysisId]/artifacts/[artifactId].get.ts", projectRoot))).toBe(true);
  });
});
