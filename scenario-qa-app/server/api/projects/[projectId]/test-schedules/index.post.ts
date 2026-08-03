import { testScheduleService } from "../../../../services/container.js";
import { getTestScheduleConfig } from "../../../../schedules/utils/schedule-config.js";
import { AppError, defineApiHandler, readBodyObject } from "../../../../utils/api.js";
import { parseTestScheduleInput } from "../../../../validators/test-schedule.validator.js";
export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw new AppError(400, "PROJECT_ID_REQUIRED", "프로젝트 ID가 필요합니다.");
  const config = getTestScheduleConfig(useRuntimeConfig(event));
  return testScheduleService.create(projectId, parseTestScheduleInput(await readBodyObject(event), config.minIntervalMinutes));
});
