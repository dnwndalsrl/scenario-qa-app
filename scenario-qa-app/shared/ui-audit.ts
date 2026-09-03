import type { UiAuditViewport, UiAuditViewportPreset } from "./types/ui-audit";

export const UI_AUDIT_VIEWPORTS: Record<UiAuditViewportPreset, UiAuditViewport> = {
  mobile: { preset: "mobile", width: 390, height: 844, label: "모바일" },
  tablet: { preset: "tablet", width: 768, height: 1024, label: "태블릿" },
  desktop: { preset: "desktop", width: 1440, height: 900, label: "데스크톱" }
};
