import type { TestRunStatus } from "./test-run.js";

export interface TestProject {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  environmentName: string;
  defaultTimeout: number;
  stopOnFailure: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  baseUrl: string;
  environmentName: string;
  defaultTimeout: number;
  stopOnFailure: boolean;
}

export interface ProjectSummary extends TestProject {
  scenarioCount: number;
  recentRunStatus: TestRunStatus | null;
  recentRunAt: string | null;
}
