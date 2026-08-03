import { aiScenarioService } from "../../../services/container.js";
import { parseAiConversionRequest } from "../../../ai/schemas/ai-conversion-request.schema.js";
import type { AiProviderConfig } from "../../../ai/types/ai-scenario.js";
import {
  defineApiHandler,
  readBodyObject
} from "../../../utils/api.js";

export default defineApiHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event);
  const input = parseAiConversionRequest(
    await readBodyObject(event),
    Number(runtimeConfig.aiScenarioMaxInputLength)
  );
  const controller = new AbortController();
  event.node.req.once("aborted", () => controller.abort());
  const providerConfig: AiProviderConfig = {
    apiKey: String(runtimeConfig.openaiApiKey),
    model: String(runtimeConfig.openaiScenarioModel),
    promptVersion: String(runtimeConfig.openaiScenarioPromptVersion),
    maxSteps: Number(runtimeConfig.aiScenarioMaxSteps),
    timeoutMs: Number(runtimeConfig.aiScenarioTimeoutMs)
  };
  return aiScenarioService.convert(input, {
    requesterId:
      getRequestIP(event, { xForwardedFor: false }) ?? "local-unknown",
    providerConfig,
    signal: controller.signal
  });
});
