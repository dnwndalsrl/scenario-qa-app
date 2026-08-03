import { getLiveness } from "../../health/health-service.js";

export default defineEventHandler(() => getLiveness());
