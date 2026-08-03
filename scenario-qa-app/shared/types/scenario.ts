export type TestAction =
  | "goto"
  | "fill"
  | "click"
  | "assert_url"
  | "assert_visible";

export type LocatorStrategy =
  | "testId"
  | "role"
  | "label"
  | "placeholder"
  | "text"
  | "css";
export type UrlOperator = "equals" | "contains";

export interface ElementTarget {
  strategy: LocatorStrategy;
  value: string;
  name?: string;
  exact?: boolean;
}

export interface UrlExpectation {
  operator: UrlOperator;
  value: string;
}

export interface TestStep {
  id: string;
  order: number;
  name: string;
  action: TestAction;
  target?: ElementTarget;
  value?: string;
  expected?: UrlExpectation;
  timeout: number;
  required: boolean;
  sensitive?: boolean;
}

export interface TestScenario {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  startUrl: string;
  stopOnFailure: boolean;
  timeout: number;
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioInput {
  name: string;
  description?: string;
  startUrl: string;
  stopOnFailure: boolean;
  timeout: number;
  steps: TestStep[];
}

export interface ScenarioSummary extends TestScenario {
  recentRunStatus: import("./test-run.js").TestRunStatus | null;
  recentRunAt: string | null;
  activeRunId: string | null;
}

export interface ValidationIssue {
  path: string;
  message: string;
}
