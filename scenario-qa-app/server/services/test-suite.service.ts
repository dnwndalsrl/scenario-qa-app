import { z } from "zod";
import type { TestSuite } from "../../shared/types/analysis";

export const testSuiteInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  testIds: z.array(z.string().trim().min(1)).min(1).max(50)
}).transform((value) => ({ ...value, testIds: [...new Set(value.testIds)] }));

export function rowToTestSuite(row: Record<string, any>): TestSuite {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    name: row.name,
    testIds: Array.isArray(row.test_ids) ? row.test_ids : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
