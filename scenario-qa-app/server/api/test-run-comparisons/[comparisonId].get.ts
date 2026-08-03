import { testRunComparisonService } from "../../services/container.js";
import { defineApiHandler } from "../../utils/api.js";

export default defineApiHandler(async (event) =>
  testRunComparisonService.get(getRouterParam(event, "comparisonId") ?? "")
);
