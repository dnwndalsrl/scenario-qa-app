import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./requirement-document.service";

describe("requirement PDF extraction", () => {
  it("extracts the ABOUT US same-page scroll requirement from the test PDF", async () => {
    const file = await readFile(path.resolve(process.cwd(), "output/pdf/qa-requirements-about-us-scroll.pdf"));
    const extracted = await extractPdfText(file);
    expect(extracted.pageCount).toBe(2);
    expect(extracted.text).toContain("ABOUT US");
    expect(extracted.text).toContain("스크롤");
    expect(extracted.text).toContain("assert_in_viewport");
  });
});
