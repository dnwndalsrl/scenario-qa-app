import type { AiScenarioSaveMetadata } from "../../../../../shared/types/ai-scenario.js";
import {
  aiScenarioService,
  scenarioService
} from "../../../../services/container.js";
import {
  AppError,
  defineApiHandler,
  readBodyObject
} from "../../../../utils/api.js";
import { parseScenarioInput } from "../../../../validators/scenario.validator.js";

export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (projectId === undefined) {
    throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  }
  const body = await readBodyObject(event);
  const input = parseScenarioInput(body);
  const aiMetadata = parseAiMetadata(body.aiConversion);
  if (aiMetadata !== null) {
    await aiScenarioService.validateBeforeSave(
      projectId,
      input,
      aiMetadata
    );
  }
  const created = await scenarioService.create(projectId, input);
  if (aiMetadata !== null) {
    await aiScenarioService.markSaved(
      aiMetadata.conversionId,
      projectId,
      created.id
    );
  }
  return created;
});

function parseAiMetadata(value: unknown): AiScenarioSaveMetadata | null {
  if (value === undefined) {
    return null;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new AppError(
      400,
      "SCENARIO_VALIDATION_FAILED",
      "AI 초안 검토 정보를 확인해 주세요."
    );
  }
  const metadata = value as Record<string, unknown>;
  if (
    typeof metadata.conversionId !== "string" ||
    !Array.isArray(metadata.reviewedStepIds) ||
    !metadata.reviewedStepIds.every(
      (item) => typeof item === "string"
    ) ||
    typeof metadata.unsupportedStepsConfirmed !== "boolean"
  ) {
    throw new AppError(
      400,
      "SCENARIO_VALIDATION_FAILED",
      "AI 초안 검토 정보를 확인해 주세요."
    );
  }
  return {
    conversionId: metadata.conversionId,
    reviewedStepIds: metadata.reviewedStepIds,
    unsupportedStepsConfirmed: metadata.unsupportedStepsConfirmed
  };
}
