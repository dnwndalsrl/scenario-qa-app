export type UiAuditViewportPreset = "mobile" | "tablet" | "desktop";
export type UiAuditStatus = "queued" | "running" | "completed" | "failed";
export type UiAuditRule = "horizontal_overflow" | "clipped_content" | "element_overlap" | "small_target" | "low_contrast";
export type UiAuditSeverity = "low" | "medium" | "high";
export type UiAuditReviewStatus = "unreviewed" | "fix_required" | "false_positive" | "deferred";

export interface UiAuditViewport {
  preset: UiAuditViewportPreset;
  width: number;
  height: number;
  label: string;
}

export interface UiDesignReference {
  id: string;
  fileName: string;
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  signedUrl?: string;
}

export interface UiDesignComparison {
  status: "matched" | "review" | "different";
  differencePercent: number;
  meanDifferencePercent: number;
  dimensionMismatch: boolean;
  referenceWidth: number;
  referenceHeight: number;
  actualWidth: number;
  actualHeight: number;
}

export interface UiAuditArtifact { id: string; state: string; width: number; height: number; signedUrl?: string; }
export interface UiAuditIssue {
  id: string; rule: UiAuditRule; severity: UiAuditSeverity; title: string; message: string; selector: string; state: string;
  actual: Record<string, string | number | boolean>; artifactSourceId?: string;
}
export interface UiAuditSummary {
  issueCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  screenshotCount: number;
  comparison?: UiDesignComparison;
}

export interface UiAuditReview {
  rule: UiAuditRule;
  status: UiAuditReviewStatus;
  note: string;
  updatedAt: string;
  defectId?: string;
}

export interface UiAuditHistoryItem {
  id: string;
  name: string;
  targetUrl: string;
  normalizedUrl: string;
  status: UiAuditStatus;
  currentMessage: string;
  hasReference: boolean;
  summary?: UiAuditSummary;
  createdAt: string;
  completedAt?: string;
}

export interface UiAudit {
  id: string;
  name: string;
  targetUrl: string;
  normalizedUrl: string;
  status: UiAuditStatus;
  currentMessage: string;
  viewport: UiAuditViewport;
  hasReference: boolean;
  reference?: UiDesignReference;
  issues: UiAuditIssue[];
  reviews: UiAuditReview[];
  artifacts: UiAuditArtifact[];
  summary?: UiAuditSummary;
  createdAt: string;
  completedAt?: string;
  error?: { code: string; message: string };
}

