-- GitHub Actions uses the service_role API key. RLS bypass does not replace
-- PostgreSQL table privileges, so grant only the tables used by the QA runner.
grant usage on schema public to service_role;
grant usage on type public.analysis_status to service_role;

grant select, insert, update on table
  public.analyses,
  public.analysis_pages,
  public.page_snapshots,
  public.page_functions,
  public.generated_tests,
  public.generated_test_steps,
  public.test_runs,
  public.test_step_results,
  public.analysis_issues,
  public.analysis_summaries,
  public.workflow_runs,
  public.artifacts
to service_role;

grant usage, select on all sequences in schema public to service_role;
