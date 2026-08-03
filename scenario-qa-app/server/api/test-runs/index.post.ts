import type { TestRunRequest } from "../../../shared/types/test-run.js";
import { testRunService } from "../../services/container.js";
import {
  AppError,
  defineApiHandler,
  readBodyObject
} from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const body = await readBodyObject(event);
  if (
    typeof body.projectId !== "string" ||
    typeof body.scenarioId !== "string"
  ) {
    throw new AppError(400, "RUN_REQUEST_INVALID", "프로젝트와 시나리오 ID가 필요합니다.");
  }
  const request: TestRunRequest = {
    projectId: body.projectId,
    scenarioId: body.scenarioId
  };
  const run = await testRunService.requestRun(request);
  setTimeout(() => {
    void testRunService.executeRun(run.id);
  }, 0);
  return {
    runId: run.id,
    status: "pending" as const
  };
});
