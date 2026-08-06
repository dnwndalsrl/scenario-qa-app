import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(new URL("./migrations/202608040001_initial_qa_schema.sql", import.meta.url), "utf8");
const grantsSql = readFileSync(new URL("./migrations/202608040002_authenticated_table_grants.sql", import.meta.url), "utf8");
const staleSql = readFileSync(new URL("./migrations/202608040003_expire_stale_analysis.sql", import.meta.url), "utf8");
const realtimeSql = readFileSync(new URL("./migrations/202608060001_enable_analysis_realtime.sql", import.meta.url), "utf8");
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
  it("grants authenticated users only the operations protected by RLS", () => {
    expect(grantsSql).toContain("grant select on table");
    expect(grantsSql).toContain("public.analyses");
    expect(grantsSql).toContain("grant delete on table public.analyses to authenticated");
    expect(grantsSql).not.toContain("grant insert on table");
  });
  it("expires only the signed-in user's stale analysis through a constrained RPC", () => {
    expect(staleSql).toContain("security definer");
    expect(staleSql).toContain("user_id = auth.uid()");
    expect(staleSql).toContain("updated_at < now() - interval '15 minutes'");
    expect(staleSql).toContain("grant execute on function public.expire_stale_analysis(uuid) to authenticated");
  });
  it("publishes analysis row changes to authenticated realtime subscribers", () => {
    expect(realtimeSql).toContain("alter publication supabase_realtime add table public.analyses");
    expect(realtimeSql).toContain("pg_publication_tables");
    expect(realtimeSql).toContain("alter table public.analyses replica identity full");
  });
});
