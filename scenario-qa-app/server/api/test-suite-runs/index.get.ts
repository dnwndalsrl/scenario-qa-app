import { testSuiteRunService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const query = getQuery(event);
  return testSuiteRunService.list({
    ...(typeof query.projectId === "string" ? { projectId: query.projectId } : {}),
    ...(typeof query.suiteId === "string" ? { suiteId: query.suiteId } : {})
  });
});
