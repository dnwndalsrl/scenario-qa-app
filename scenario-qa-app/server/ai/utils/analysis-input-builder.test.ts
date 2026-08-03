import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/api.js";
import {
  failureLimits,
  failureProject,
  failureRunDetail,
  failureScenario
} from "../failure-test-fixtures.js";
import { buildFailureAnalysisInput } from "./analysis-input-builder.js";
import { createAnalysisInputFingerprint } from "./input-fingerprint.js";

describe("failure analysis input", () => {
  it("동일한 입력에서 같은 fingerprint를 생성하고 키 순서에는 영향받지 않는다", () => {
    expect(createAnalysisInputFingerprint({ b: 2, a: 1 })).toBe(
      createAnalysisInputFingerprint({ a: 1, b: 2 })
    );
    const input = buildFailureAnalysisInput(
      failureProject,
      failureScenario,
      failureRunDetail,
      failureLimits
    );
    expect(createAnalysisInputFingerprint(input)).toHaveLength(64);
  });

  it("전체 입력 크기 제한을 넘으면 낮은 우선순위 정보를 줄인다", () => {
    const input = buildFailureAnalysisInput(
      failureProject,
      failureScenario,
      failureRunDetail,
      { ...failureLimits, maxTotalInputLength: 5000 }
    );
    expect(JSON.stringify(input).length).toBeLessThanOrEqual(5000);
  });

  it("근거 자체를 담을 수 없는 제한이면 명확한 오류를 반환한다", () => {
    expect(() =>
      buildFailureAnalysisInput(
        failureProject,
        failureScenario,
        failureRunDetail,
        { ...failureLimits, maxTotalInputLength: 150 }
      )
    ).toThrowError(AppError);
    try {
      buildFailureAnalysisInput(
        failureProject,
        failureScenario,
        failureRunDetail,
        { ...failureLimits, maxTotalInputLength: 150 }
      );
    } catch (error: unknown) {
      expect((error as AppError).code).toBe("AI_ANALYSIS_INPUT_TOO_LARGE");
    }
  });

  it("선행 실패 근거가 없는 blocked 단계만으로는 분석하지 않는다", () => {
    const blockedOnly = structuredClone(failureRunDetail);
    blockedOnly.run.status = "blocked";
    if (blockedOnly.result !== null) {
      blockedOnly.result.status = "blocked";
      blockedOnly.result.steps = blockedOnly.result.steps.map((step) => ({
        ...step,
        status: "blocked",
        errorMessage: null,
        actual: {},
        screenshotArtifactId: null,
        currentUrl: ""
      }));
      blockedOnly.result.consoleLogs = [];
      blockedOnly.result.networkErrors = [];
    }
    expect(() =>
      buildFailureAnalysisInput(
        failureProject,
        failureScenario,
        blockedOnly,
        failureLimits
      )
    ).toThrowError(AppError);
  });
});
