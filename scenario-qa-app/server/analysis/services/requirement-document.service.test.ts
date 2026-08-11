import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText, normalizeRequirementAssessment } from "./requirement-document.service";

describe("requirement PDF extraction", () => {
  it("extracts the ABOUT US same-page scroll requirement from the test PDF", async () => {
    const file = await readFile(path.resolve(process.cwd(), "output/pdf/qa-requirements-about-us-scroll.pdf"));
    const extracted = await extractPdfText(file);
    expect(extracted.pageCount).toBe(2);
    expect(extracted.text).toContain("ABOUT US");
    expect(extracted.text).toContain("스크롤");
    expect(extracted.text).toContain("assert_in_viewport");
  });

  it("does not invent requirements for an unrelated document", () => {
    const result = normalizeRequirementAssessment({
      summary: "회사 홍보 자료", documentType: "unrelated", qaSuitability: "review_required", confidence: .9,
      requirements: [], limitations: [], missingInformation: ["사용자 행동", "기대 결과"]
    });
    expect(result.qaSuitability).toBe("unsuitable");
  });

  it("marks incomplete requirements for user review", () => {
    const result = normalizeRequirementAssessment({
      summary: "메뉴 동작 요구사항", documentType: "requirement_spec", qaSuitability: "suitable", confidence: .9,
      requirements: [{ id: "REQ-001", title: "ABOUT US", description: "메뉴 클릭", expectedBehavior: "섹션으로 스크롤", priority: "high", sourceReference: "1쪽" }],
      limitations: [], missingInformation: ["지원 브라우저"]
    });
    expect(result.qaSuitability).toBe("review_required");
  });
});
