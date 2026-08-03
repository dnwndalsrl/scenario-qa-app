import { testScheduleService } from "../../services/container.js";
import { AppError, defineApiHandler } from "../../utils/api.js";
export default defineApiHandler(async (event) => { const executionId = getRouterParam(event, "executionId"); if (!executionId) throw new AppError(400, "TEST_SCHEDULE_EXECUTION_ID_REQUIRED", "예약 실행 ID가 필요합니다."); return testScheduleService.getExecutionById(executionId); });
