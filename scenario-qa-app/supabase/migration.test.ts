import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(new URL("./migrations/202608040001_initial_qa_schema.sql", import.meta.url), "utf8");
describe("Supabase migration security", () => {
  it("enables RLS on every user-owned table", () => {
    for (const table of ["analyses","analysis_pages","page_snapshots","page_functions","generated_tests","generated_test_steps","test_runs","test_step_results","analysis_issues","analysis_summaries","workflow_runs","artifacts"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
  });
  it("keeps artifacts private and uses an atomic job RPC", () => {
    expect(sql).toContain("values('qa-artifacts','qa-artifacts',false"); expect(sql).toContain("create or replace function public.create_analysis_job"); expect(sql).toContain("pg_advisory_xact_lock");
  });
  it("contains the production limits", () => {
    expect(sql).toContain(">= 5"); expect(sql).toContain(">= 1"); expect(sql).toContain("p_max_pages not between 1 and 5"); expect(sql).toContain("p_max_depth not between 0 and 2");
  });
});
