import { describe, expect, it, vi } from "vitest";
import { inspectDesignImage, saveUiDesignReference } from "./ui-design-reference.service";

function png(width = 1440, height = 900) {
  const bytes = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes); bytes.write("IHDR", 12, "ascii"); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20); return bytes;
}
function jpeg(width = 390, height = 844) {
  return Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x0b,0x08,height >> 8,height & 255,width >> 8,width & 255,0x01,0x01,0x11,0x00,0xff,0xd9]);
}
function mockClient(rowError?: string) {
  const upload = vi.fn().mockResolvedValue({ error: null }); const remove = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ error: rowError ? { message: rowError } : null });
  return { client: { storage: { from: vi.fn(() => ({ upload, remove })) }, from: vi.fn(() => ({ insert })) } as any, upload, remove, insert };
}

describe("UI design reference", () => {
  it("reads real dimensions from PNG and JPEG headers", () => {
    expect(inspectDesignImage(png(), "image/png")).toMatchObject({ width: 1440, height: 900, extension: "png" });
    expect(inspectDesignImage(jpeg(), "image/jpeg")).toMatchObject({ width: 390, height: 844, extension: "jpg" });
  });
  it("rejects a file whose declared image type does not match its bytes", () => {
    expect(() => inspectDesignImage(Buffer.from("not an image"), "image/png")).toThrow("정상적인 PNG 또는 JPG");
  });
  it("stores the image below the authenticated user's private path", async () => {
    const { client, upload, insert } = mockClient();
    await saveUiDesignReference(client, { auditId: "audit-1", userId: "user-1", fileName: "desktop.png", bytes: png(), metadata: inspectDesignImage(png(), "image/png") });
    expect(upload).toHaveBeenCalledWith("user-1/audit-1/reference.png", expect.any(Buffer), expect.objectContaining({ contentType: "image/png" }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ audit_id: "audit-1", user_id: "user-1", width: 1440, height: 900 }));
  });
  it("removes an uploaded image when its database row cannot be saved", async () => {
    const { client, remove } = mockClient("denied");
    await expect(saveUiDesignReference(client, { auditId: "audit-1", userId: "user-1", fileName: "desktop.png", bytes: png(), metadata: inspectDesignImage(png(), "image/png") })).rejects.toMatchObject({ code: "DESIGN_RECORD_FAILED" });
    expect(remove).toHaveBeenCalledWith(["user-1/audit-1/reference.png"]);
  });
});
