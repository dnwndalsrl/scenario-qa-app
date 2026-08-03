import { describe, expect, it } from "vitest";
import {
  failureLimits,
  failureProject,
  failureRunDetail,
  failureScenario
} from "../failure-test-fixtures.js";
import { buildAnalysisEvidence } from "./evidence-builder.js";

describe("buildAnalysisEvidence", () => {
  it("실패 단계, 콘솔, 네트워크, 스크린샷 메타데이터에 고유 근거 ID를 만든다", () => {
    const result = buildAnalysisEvidence(
      failureProject,
      failureScenario,
      failureRunDetail,
      failureLimits
    );
    const ids = result.evidence.map((item) => item.id);
    expect(ids).toContain("step-3-result");
    expect(ids).toContain("console-1");
    expect(ids).toContain("network-1");
    expect(ids).toContain("screenshot-3");
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.scenarioSteps.some((step) => step.isFailurePoint)).toBe(true);
  });

  it("분석 근거에 민감값, 파일 경로, 원본 스크린샷 경로를 포함하지 않는다", () => {
    const result = buildAnalysisEvidence(
      failureProject,
      failureScenario,
      failureRunDetail,
      failureLimits
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret123");
    expect(serialized).not.toContain("artifact-1");
    expect(serialized).not.toContain("access_token=abc");
    expect(serialized).toContain("REDACTED");
  });

  it("단계 제한이 작아도 실패 단계와 인접 단계를 우선 선택한다", () => {
    const result = buildAnalysisEvidence(
      failureProject,
      failureScenario,
      failureRunDetail,
      { ...failureLimits, maxFailedSteps: 2 }
    );
    expect(result.scenarioSteps.some((step) => step.stepId === "step-dashboard")).toBe(true);
    expect(result.limitations.some((item) => item.includes("입력 제한"))).toBe(true);
  });
});

