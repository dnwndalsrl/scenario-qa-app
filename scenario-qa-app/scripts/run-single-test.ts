import { runSingleTest } from "../packages/qa-engine/single-test";
import { uuidArg } from "./uuid-args";

const args = process.argv.slice(2);
runSingleTest(uuidArg(args, "analysis-id"), uuidArg(args, "test-id"), uuidArg(args, "test-run-id"))
  .catch((error) => { console.error(error instanceof Error ? error.message : "Single test runner failed"); process.exitCode = 1; });
