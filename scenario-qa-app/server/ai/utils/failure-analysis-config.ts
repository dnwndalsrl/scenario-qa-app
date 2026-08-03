import type { H3Event } from "h3";
import type { AiFailureAnalysisProviderConfig } from "../types/ai-failure-analysis.js";

export function getFailureAnalysisProviderConfig(
  event: H3Event
): AiFailureAnalysisProviderConfig {
  const config = useRuntimeConfig(event);
  return {
    apiKey: String(config.openaiApiKey),
    model: String(config.openaiFailureAnalysisModel),
    promptVersion: String(config.openaiFailureAnalysisPromptVersion),
    timeoutMs: Number(config.aiFailureAnalysisTimeoutMs),
    maxCauses: Number(config.aiFailureAnalysisMaxCauses),
    maxActions: Number(config.aiFailureAnalysisMaxActions),
    maxChecks: Number(config.aiFailureAnalysisMaxChecks),
    maxFailedSteps: Number(config.aiAnalysisMaxFailedSteps),
    maxConsoleErrors: Number(config.aiAnalysisMaxConsoleErrors),
    maxNetworkErrors: Number(config.aiAnalysisMaxNetworkErrors),
    maxMessageLength: Number(config.aiAnalysisMaxMessageLength),
    maxTotalInputLength: Number(config.aiAnalysisMaxTotalInputLength)
  };
}

