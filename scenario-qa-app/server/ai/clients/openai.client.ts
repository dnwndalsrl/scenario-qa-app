import OpenAI, {
  APIConnectionTimeoutError,
  APIUserAbortError,
  RateLimitError
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AiScenarioConversionRequest } from "../../../shared/types/ai-scenario.js";
import { FAILURE_ANALYZER_SYSTEM_PROMPT } from "../prompts/failure-analyzer.prompt.js";
import {
  AiScenarioStructuredOutputSchema
} from "../schemas/ai-scenario-response.schema.js";
import { AiFailureAnalysisStructuredOutputSchema } from "../schemas/ai-failure-analysis-response.schema.js";
import type {
  AiFailureAnalysisInput,
  AiFailureAnalysisProvider,
  AiFailureAnalysisProviderConfig,
  AiFailureAnalysisProviderOutput
} from "../types/ai-failure-analysis.js";
import type {
  AiProviderConfig,
  AiProviderConversion,
  AiScenarioProvider
} from "../types/ai-scenario.js";
import { AiProviderError } from "../types/ai-scenario.js";
import { SCENARIO_CONVERTER_SYSTEM_PROMPT } from "../prompts/scenario-converter.prompt.js";
import { serializeFailureAnalysisInput } from "../utils/analysis-input-builder.js";
import { buildScenarioPromptInput } from "../utils/prompt-input-builder.js";

export class OpenAiScenarioClient implements AiScenarioProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: AiProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 1,
      timeout: config.timeoutMs
    });
  }

  async convert(
    input: AiScenarioConversionRequest,
    signal?: AbortSignal
  ): Promise<AiProviderConversion> {
    try {
      const response = await this.client.responses.parse(
        {
          model: this.config.model,
          instructions: SCENARIO_CONVERTER_SYSTEM_PROMPT,
          input: buildScenarioPromptInput(input),
          text: {
            format: zodTextFormat(
              AiScenarioStructuredOutputSchema,
              "scenario_conversion"
            )
          },
          temperature: 0.2,
          max_output_tokens: Math.min(
            12_000,
            1_200 + this.config.maxSteps * 200
          )
        },
        signal === undefined ? {} : { signal }
      );
      if (response.output_parsed === null) {
        throw new AiProviderError(
          "invalid_response",
          "구조화된 응답이 비어 있습니다."
        );
      }
      return {
        response: response.output_parsed,
        usage: {
          ...(response.usage?.input_tokens === undefined
            ? {}
            : { inputTokenCount: response.usage.input_tokens }),
          ...(response.usage?.output_tokens === undefined
            ? {}
            : { outputTokenCount: response.usage.output_tokens })
        }
      };
    } catch (error: unknown) {
      throw mapOpenAiError(error);
    }
  }
}

export class OpenAiFailureAnalysisClient
  implements AiFailureAnalysisProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: AiFailureAnalysisProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 1,
      timeout: config.timeoutMs
    });
  }

  async analyze(
    input: AiFailureAnalysisInput,
    signal?: AbortSignal
  ): Promise<AiFailureAnalysisProviderOutput> {
    try {
      const response = await this.client.responses.parse(
        {
          model: this.config.model,
          instructions: FAILURE_ANALYZER_SYSTEM_PROMPT,
          input: serializeFailureAnalysisInput(input),
          text: {
            format: zodTextFormat(
              AiFailureAnalysisStructuredOutputSchema,
              "failure_analysis"
            )
          },
          temperature: 0.2,
          max_output_tokens: Math.min(
            12_000,
            2_000 +
              this.config.maxCauses * 500 +
              this.config.maxActions * 350 +
              this.config.maxChecks * 250
          )
        },
        signal === undefined ? {} : { signal }
      );
      if (response.output_parsed === null) {
        throw new AiProviderError(
          "invalid_response",
          "구조화된 실패 분석 응답이 비어 있습니다."
        );
      }
      return {
        response: response.output_parsed,
        usage: {
          ...(response.usage?.input_tokens === undefined
            ? {}
            : { inputTokenCount: response.usage.input_tokens }),
          ...(response.usage?.output_tokens === undefined
            ? {}
            : { outputTokenCount: response.usage.output_tokens })
        }
      };
    } catch (error: unknown) {
      throw mapOpenAiError(error);
    }
  }
}

function mapOpenAiError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new AiProviderError("timeout", "OpenAI 요청 시간이 초과되었습니다.");
  }
  if (error instanceof APIUserAbortError) {
    return new AiProviderError("aborted", "OpenAI 요청이 취소되었습니다.");
  }
  if (error instanceof RateLimitError) {
    return new AiProviderError(
      "rate_limited",
      "OpenAI 요청 한도에 도달했습니다."
    );
  }
  return new AiProviderError("provider", "OpenAI 요청을 처리하지 못했습니다.");
}
