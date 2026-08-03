import { testRunService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async (event) => {
  const query = getQuery(event);
  return testRunService.list({
    ...(typeof query.projectId === "string"
      ? { projectId: query.projectId }
      : {}),
    ...(typeof query.scenarioId === "string"
      ? { scenarioId: query.scenarioId }
      : {})
  });
});
