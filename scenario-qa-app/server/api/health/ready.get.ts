import { getReadiness } from "../../health/health-service.js";

export default defineEventHandler(async (event) => {
  const result = await getReadiness();
  if (result.status !== "ok") setResponseStatus(event, 503);
  return result;
});
