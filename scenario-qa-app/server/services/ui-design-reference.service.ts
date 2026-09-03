import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportedDesignContentType = "image/png" | "image/jpeg";
export interface DesignImageMetadata { contentType: SupportedDesignContentType; extension: "png" | "jpg"; width: number; height: number; }

export class UiDesignReferenceError extends Error {
  constructor(public readonly code: "INVALID_DESIGN_IMAGE" | "DESIGN_UPLOAD_FAILED" | "DESIGN_RECORD_FAILED", message: string) { super(message); }
}
function pngMetadata(bytes: Buffer): DesignImageMetadata | undefined {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.subarray(12, 16).toString("ascii") !== "IHDR") return;
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (!width || !height) return;
  return { contentType: "image/png", extension: "png", width, height };
}

function jpegMetadata(bytes: Buffer): DesignImageMetadata | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 1 >= bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      const height = bytes.readUInt16BE(offset + 3); const width = bytes.readUInt16BE(offset + 5);
      if (width && height) return { contentType: "image/jpeg", extension: "jpg", width, height };
    }
    offset += length;
  }
}

export function inspectDesignImage(bytes: Buffer, declaredType?: string): DesignImageMetadata {
  const metadata = declaredType === "image/png" ? pngMetadata(bytes) : declaredType === "image/jpeg" ? jpegMetadata(bytes) : undefined;
  if (!metadata || bytes.length > 10 * 1024 * 1024) throw new UiDesignReferenceError("INVALID_DESIGN_IMAGE", "10MB 이하의 정상적인 PNG 또는 JPG 파일만 등록할 수 있습니다.");
  if (metadata.width > 10000 || metadata.height > 20000) throw new UiDesignReferenceError("INVALID_DESIGN_IMAGE", "디자인 이미지 해상도가 허용 범위를 초과했습니다.");
  return metadata;
}

export async function saveUiDesignReference(client: SupabaseClient, input: {
  auditId: string; userId: string; fileName: string; bytes: Uint8Array; metadata: DesignImageMetadata;
}): Promise<void> {
  const storagePath = `${input.userId}/${input.auditId}/reference.${input.metadata.extension}`;
  const { error: uploadError } = await client.storage.from("qa-ui-designs").upload(storagePath, input.bytes, { contentType: input.metadata.contentType, upsert: false });
  if (uploadError) throw new UiDesignReferenceError("DESIGN_UPLOAD_FAILED", uploadError.message);
  const { error: rowError } = await client.from("ui_design_references").insert({
    audit_id: input.auditId, user_id: input.userId, file_name: input.fileName.slice(0, 240), storage_path: storagePath,
    content_type: input.metadata.contentType, width: input.metadata.width, height: input.metadata.height
  });
  if (!rowError) return;
  await client.storage.from("qa-ui-designs").remove([storagePath]);
  throw new UiDesignReferenceError("DESIGN_RECORD_FAILED", rowError.message);
}
