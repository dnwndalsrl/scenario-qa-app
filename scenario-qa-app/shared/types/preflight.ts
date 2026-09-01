export type PreflightStatus = "ready" | "warning" | "blocked";

export interface PreflightCheck {
  id: "target" | "storage" | "scenarios" | "active_runs" | "runner";
  label: string;
  status: PreflightStatus;
  message: string;
}

export interface AnalysisPreflight {
  status: PreflightStatus;
  canRun: boolean;
  checkedAt: string;
  readyScenarioCount: number;
  excludedScenarioCount: number;
  checks: PreflightCheck[];
}
