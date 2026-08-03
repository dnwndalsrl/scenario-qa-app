import type {
  AiFailureAnalysisResult,
  AnalysisEvidence
} from "../../../shared/types/ai-failure-analysis.js";

export interface AiFailureAnalysisLimits {
  maxCauses: number;
  maxActions: number;
  maxChecks: number;
  maxFailedSteps: number;
  maxConsoleErrors: number;
  maxNetworkErrors: number;
  maxMessageLength: number;
  maxTotalInputLength: number;
}

export interface AiFailureAnalysisProviderConfig
  extends AiFailureAnalysisLimits {
  apiKey: string;
  model: string;
  promptVersion: string;
  timeoutMs: number;
}

export interface AnalysisScenarioStep {
  stepId: string;
  order: number;
  name: string;
  action: string;
  description: string;
  executionStatus: string;
  isFailurePoint: boolean;
}

export interface AiFailureAnalysisInput {
  execution: {
    projectName: string;
    baseOrigin: string;
    scenarioName: string;
    runStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    browser: "chromium";
    viewport: { width: number; height: number };
    environmentName: string;
  };
  scenarioSteps: AnalysisScenarioStep[];
  evidence: AnalysisEvidence[];
  inputLimitations: string[];
}

export interface AiFailureAnalysisProviderOutput {
  response: unknown;
  usage: {
    inputTokenCount?: number;
    outputTokenCount?: number;
  };
}

export interface AiFailureAnalysisProvider {
  analyze(
    input: AiFailureAnalysisInput,
    signal?: AbortSignal
  ): Promise<AiFailureAnalysisProviderOutput>;
}

export type AiFailureAnalysisProviderFactory = (
  config: AiFailureAnalysisProviderConfig
) => AiFailureAnalysisProvider;

export interface ValidatedFailureAnalysis {
  result: AiFailureAnalysisResult;
}

