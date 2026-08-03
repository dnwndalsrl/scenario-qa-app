import type { H3Event } from "h3";
import { analyticsConfig } from "../../services/container.js";
import { AppError } from "../../utils/api.js";
import { parseAnalyticsQuery } from "../../validators/analytics-query.validator.js";

export function resolveAnalyticsRequest(event: H3Event) {
  const projectId = getRouterParam(event, "projectId");
  if (!projectId) throw new AppError(400, "QUERY_INVALID", "프로젝트 ID가 필요합니다.");
  return { projectId, query: parseAnalyticsQuery(getQuery(event), analyticsConfig) };
}
