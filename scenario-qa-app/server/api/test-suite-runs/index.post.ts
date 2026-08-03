import type { TestSuiteRunRequest } from "../../../shared/types/test-suite.js";
import { testSuiteRunService } from "../../services/container.js";
import { AppError, defineApiHandler, readBodyObject } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const body = await readBodyObject(event);
  if (typeof body.projectId !== "string" || typeof body.suiteId !== "string") {
    throw new AppError(
      400,
      "TEST_SUITE_VALIDATION_FAILED",
      "프로젝트와 테스트 스위트 ID가 필요합니다."
    );
  }
  const request: TestSuiteRunRequest = {
    projectId: body.projectId,
    suiteId: body.suiteId
  };
  const run = await testSuiteRunService.requestRun(request);
  setTimeout(() => {
    void testSuiteRunService.executeRun(run.id);
  }, 0);
  return { suiteRunId: run.id, status: "pending" as const };
});
