import { projectAnalyticsService } from "../../../../services/container.js";
import { resolveAnalyticsRequest } from "../../../../analytics/utils/analytics-request.js";
import { defineApiHandler } from "../../../../utils/api.js";
export default defineApiHandler(async (event) => { const { projectId, query } = resolveAnalyticsRequest(event); return projectAnalyticsService.summary(projectId, query); });
