import { testScheduleService } from "../../services/container.js";
import { getTestScheduleConfig } from "../../schedules/utils/schedule-config.js";
import { defineApiHandler, readBodyObject } from "../../utils/api.js";
import { parseSchedulePreviewInput } from "../../validators/test-schedule.validator.js";
export default defineApiHandler(async (event) => { const config = getTestScheduleConfig(useRuntimeConfig(event)); return testScheduleService.preview(parseSchedulePreviewInput(await readBodyObject(event), config.minIntervalMinutes)); });
