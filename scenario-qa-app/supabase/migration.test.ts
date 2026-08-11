import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync(new URL("./migrations/202608040001_initial_qa_schema.sql", import.meta.url), "utf8");
const grantsSql = readFileSync(new URL("./migrations/202608040002_authenticated_table_grants.sql", import.meta.url), "utf8");
const staleSql = readFileSync(new URL("./migrations/202608040003_expire_stale_analysis.sql", import.meta.url), "utf8");
const unstartedSql = readFileSync(new URL("./migrations/202608100001_expire_unstarted_analysis.sql", import.meta.url), "utf8");
const serviceRoleSql = readFileSync(new URL("./migrations/202608100002_service_role_runner_grants.sql", import.meta.url), "utf8");
const dailyLimitSql = readFileSync(new URL("./migrations/202608100003_raise_daily_analysis_limit.sql", import.meta.url), "utf8");
const realtimeSql = readFileSync(new URL("./migrations/202608060001_enable_analysis_realtime.sql", import.meta.url), "utf8");
const broadcastSql = readFileSync(new URL("./migrations/202608060002_analysis_private_broadcast.sql", import.meta.url), "utf8");
const threeStageSql = readFileSync(new URL("./migrations/202608110001_three_stage_analysis.sql", import.meta.url), "utf8");
const requirementUploadSql = readFileSync(new URL("./migrations/202608110002_authenticated_requirement_upload.sql", import.meta.url), "utf8");
const dispatchStateFixSql = readFileSync(new URL("./migrations/202608110003_fix_dispatch_state_enum_cast.sql", import.meta.url), "utf8");
const generatedTestEditorSql = readFileSync(new URL("./migrations/202608110004_generated_test_editor_permissions.sql", import.meta.url), "utf8");
describe("Supabase migration security", () => {
  it("enables RLS on every user-owned table", () => {
    for (const table of ["analyses","analysis_pages","page_snapshots","page_functions","generated_tests","generated_test_steps","test_runs","test_step_results","analysis_issues","analysis_summaries","workflow_runs","artifacts"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
  });
  it("keeps artifacts private and uses an atomic job RPC", () => {
    expect(sql).toContain("values('qa-artifacts','qa-artifacts',false"); expect(sql).toContain("create or replace function public.create_analysis_job"); expect(sql).toContain("pg_advisory_xact_lock");
  });
  it("contains the production limits", () => {
    expect(sql).toContain(">= 5"); expect(sql).toContain(">= 1"); expect(sql).toContain("p_max_pages not between 1 and 5"); expect(sql).toContain("p_max_depth not between 0 and 2");
    expect(dailyLimitSql).toContain(">= 20"); expect(dailyLimitSql).toContain("'dailyLimit', 20");
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

  it("expires analyses that never start sooner than actively running analyses", () => {
    expect(unstartedSql).toContain("status = 'running' and updated_at < now() - interval '15 minutes'");
    expect(unstartedSql).toContain("status in ('queued', 'dispatching', 'dispatched', 'cancel_requested')");
    expect(unstartedSql).toContain("updated_at < now() - interval '5 minutes'");
    expect(unstartedSql).toContain("'code', 'RUNNER_NOT_STARTED'");
    expect(unstartedSql).toContain("user_id = auth.uid()");
  });
  it("grants the Actions service role only the QA runner's database operations", () => {
    expect(serviceRoleSql).toContain("grant usage on schema public to service_role");
    expect(serviceRoleSql).toContain("grant select, insert, update on table");
    expect(serviceRoleSql).toContain("public.analyses");
    expect(serviceRoleSql).toContain("public.workflow_runs");
    expect(serviceRoleSql).not.toContain("grant delete");
  });
  it("allows scenario edits to replace only generated test steps", () => {
    expect(generatedTestEditorSql).toContain("grant delete on table public.generated_test_steps to service_role");
    expect(generatedTestEditorSql).not.toContain("public.generated_tests to service_role");
  });
  it("broadcasts minimal analysis updates on an owner-scoped private channel", () => {
    expect(broadcastSql).toContain("create policy analysis_owners_receive_updates");
    expect(broadcastSql).toContain("user_id = auth.uid()");
    expect(broadcastSql).toContain("realtime.topic() = 'analysis:' || id::text");
    expect(broadcastSql).toContain("perform realtime.send(");
    expect(broadcastSql).toContain("after update on public.analyses");
    expect(broadcastSql).toContain("alter publication supabase_realtime drop table public.analyses");
  });
  it("adds the private PDF requirements stage and broadcasts stage changes", () => {
    expect(threeStageSql).toContain("process_stage text not null");
    expect(threeStageSql).toContain("create table if not exists public.requirement_documents");
    expect(threeStageSql).toContain("alter table public.requirement_documents enable row level security");
    expect(threeStageSql).toContain("values('qa-requirements','qa-requirements',false,10485760");
    expect(threeStageSql).toContain("'process_stage', new.process_stage");
    expect(threeStageSql).toContain("'scenarios_approved_at', new.scenarios_approved_at");
  });

  it("allows authenticated users to save PDFs only below their own storage path", () => {
    expect(requirementUploadSql).toContain("create policy requirement_documents_insert_own");
    expect(requirementUploadSql).toContain("create policy qa_requirements_insert_own");
    expect(requirementUploadSql).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(requirementUploadSql).toContain("fail_analysis_document_upload");
    expect(requirementUploadSql).toContain("set_analysis_dispatch_state");
    expect(requirementUploadSql).toContain("p_status not in ('dispatching', 'dispatched', 'dispatch_failed')");
  });

  it("casts the dispatch status text to the analyses enum before updating", () => {
    expect(dispatchStateFixSql).toContain("status = p_status::public.analysis_status");
    expect(dispatchStateFixSql).toContain("user_id = auth.uid()");
    expect(dispatchStateFixSql).toContain("grant execute on function public.set_analysis_dispatch_state(uuid,text,text,text,jsonb) to authenticated");
  });
});
