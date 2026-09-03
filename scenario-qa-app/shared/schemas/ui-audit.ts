import { z } from "zod";

export const createUiAuditSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  name: z.string().trim().min(1).max(80),
  viewportPreset: z.enum(["mobile", "tablet", "desktop"])
});
