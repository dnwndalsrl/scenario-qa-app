import type { TestScenario, TestStep } from "../../shared/types/scenario.js";
import type { TestRun } from "../../shared/types/test-run.js";

export interface StoredArtifact {
  id: string;
  runId: string;
  stepId: string;
  type: "screenshot";
  relativePath: string;
}

export interface StoredTestRun extends TestRun {
  resultFilePath?: string;
  artifacts: StoredArtifact[];
  scenarioSteps?: TestStep[];
  scenarioSnapshot?: TestScenario;
}
