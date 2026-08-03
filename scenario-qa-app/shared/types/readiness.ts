export interface ScenarioStabilityResult {
  scenarioId: string; scenarioName: string; executionCount: number; successCount: number;
  failedCount: number; errorCount: number; blockedCount: number; stabilityRate: number;
  averageDurationMs?: number; minDurationMs?: number; maxDurationMs?: number;
  intermittentFailureCount: number; commonFailureSteps: { stepName: string; count: number }[];
}

export interface ProductionReadinessCheck {
  key: string; title: string; status: "not_checked" | "checking" | "passed" | "warning" | "failed";
  description: string; evidence?: string[];
}

export interface ReadinessIssue {
  id: string; category: "stability" | "security" | "storage" | "scheduler" | "notification" | "performance" | "deployment" | "usability";
  severity: "critical" | "high" | "medium" | "low"; title: string; description: string;
  reproductionSteps: string[]; expectedResult: string; actualResult: string; relatedFiles: string[];
  status: "open" | "fixed" | "accepted"; resolution?: string;
}

export interface ReadinessRecommendation { priority: "high" | "medium" | "low"; title: string; description: string; }

export interface ProductionReadinessReport {
  projectId: string; status: "ready" | "ready_with_warnings" | "not_ready";
  checks: ProductionReadinessCheck[]; stabilityResults: ScenarioStabilityResult[];
  securityIssues: ReadinessIssue[]; reliabilityIssues: ReadinessIssue[]; performanceIssues: ReadinessIssue[];
  storageIssues: ReadinessIssue[]; deploymentIssues: ReadinessIssue[];
  recommendations: ReadinessRecommendation[]; generatedAt: string;
}
