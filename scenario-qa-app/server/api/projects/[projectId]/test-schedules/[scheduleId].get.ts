import { testScheduleService } from "../../../../services/container.js";
import { AppError, defineApiHandler } from "../../../../utils/api.js";
export default defineApiHandler(async (event) => {
  const projectId = getRouterParam(event, "projectId"); const scheduleId = getRouterParam(event, "scheduleId");
  if (!projectId || !scheduleId) throw new AppError(400, "TEST_SCHEDULE_ID_REQUIRED", "프로젝트와 예약 ID가 필요합니다.");
  return testScheduleService.getDetail(projectId, scheduleId);
});
