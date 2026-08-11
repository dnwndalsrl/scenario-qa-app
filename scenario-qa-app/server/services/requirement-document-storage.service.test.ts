import { describe, expect, it, vi } from "vitest";
import { RequirementDocumentSaveError, saveRequirementDocument } from "./requirement-document-storage.service";

function mockClient(options: { uploadError?: string; rowError?: string } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: options.uploadError ? { message: options.uploadError } : null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: options.rowError ? { message: options.rowError } : null });
  return {
    client: {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => ({ insert }))
    } as any,
    upload,
    remove,
    insert
  };
}

describe("requirement document storage", () => {
  it("stores the PDF with the authenticated user's path", async () => {
    const { client, upload, insert } = mockClient();
    await saveRequirementDocument(client, { analysisId: "analysis-1", userId: "user-1", fileName: "requirements.pdf", bytes: new Uint8Array([1, 2]) });
    expect(upload).toHaveBeenCalledWith("user-1/analysis-1/requirements.pdf", expect.any(Uint8Array), expect.objectContaining({ contentType: "application/pdf" }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ analysis_id: "analysis-1", user_id: "user-1" }));
  });

  it("does not create a row when upload fails", async () => {
    const { client, insert } = mockClient({ uploadError: "upload denied" });
    await expect(saveRequirementDocument(client, { analysisId: "a", userId: "u", fileName: "r.pdf", bytes: new Uint8Array() }))
      .rejects.toMatchObject({ code: "PDF_UPLOAD_FAILED" } satisfies Partial<RequirementDocumentSaveError>);
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes the uploaded object when the database row fails", async () => {
    const { client, remove } = mockClient({ rowError: "row denied" });
    await expect(saveRequirementDocument(client, { analysisId: "a", userId: "u", fileName: "r.pdf", bytes: new Uint8Array() }))
      .rejects.toMatchObject({ code: "PDF_RECORD_FAILED" } satisfies Partial<RequirementDocumentSaveError>);
    expect(remove).toHaveBeenCalledWith(["u/a/requirements.pdf"]);
  });
});
