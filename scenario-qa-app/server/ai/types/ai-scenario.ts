import type { AiScenarioConversionRequest } from "../../../shared/types/ai-scenario.js";
import type { AiScenarioProviderResponse } from "../schemas/ai-scenario-response.schema.js";

export interface AiProviderConfig {
  apiKey: string;
  model: string;
  promptVersion: string;
  maxSteps: number;
  timeoutMs: number;
}

export interface AiProviderUsage {
  inputTokenCount?: number;
  outputTokenCount?: number;
}

export interface AiProviderConversion {
  response: AiScenarioProviderResponse;
  usage: AiProviderUsage;
}

export interface AiScenarioProvider {
  convert(
    input: AiScenarioConversionRequest,
    signal?: AbortSignal
  ): Promise<AiProviderConversion>;
}

export type AiScenarioProviderFactory = (
  config: AiProviderConfig
) => AiScenarioProvider;

export type AiProviderErrorKind =
  | "timeout"
  | "invalid_response"
  | "rate_limited"
  | "aborted"
  | "provider";

export class AiProviderError extends Error {
  override readonly name = "AiProviderError";

  constructor(
    readonly kind: AiProviderErrorKind,
    message: string
  ) {
    super(message);
  }
}
