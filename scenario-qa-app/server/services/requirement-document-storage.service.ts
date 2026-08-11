import type { SupabaseClient } from "@supabase/supabase-js";

export class RequirementDocumentSaveError extends Error {
  constructor(public readonly code: "PDF_UPLOAD_FAILED" | "PDF_RECORD_FAILED", message: string) {
    super(message);
  }
}

export async function saveRequirementDocument(client: SupabaseClient, input: {
  analysisId: string;
  userId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<void> {
  const storagePath = `${input.userId}/${input.analysisId}/requirements.pdf`;
  const { error: uploadError } = await client.storage.from("qa-requirements").upload(storagePath, input.bytes, {
    contentType: "application/pdf",
    upsert: false
  });
  if (uploadError) throw new RequirementDocumentSaveError("PDF_UPLOAD_FAILED", uploadError.message);

  const { error: rowError } = await client.from("requirement_documents").insert({
    analysis_id: input.analysisId,
    user_id: input.userId,
    file_name: input.fileName.slice(0, 240),
    storage_path: storagePath,
    status: "pending",
    payload: { fileName: input.fileName, status: "pending", requirements: [], limitations: [], missingInformation: [] }
  });
  if (!rowError) return;

  await client.storage.from("qa-requirements").remove([storagePath]);
  throw new RequirementDocumentSaveError("PDF_RECORD_FAILED", rowError.message);
}
