-- RLS policies limit every row to auth.uid(); these grants only make those
-- policies reachable by logged-in users.
grant usage on schema public to authenticated;
grant usage on type public.analysis_status to authenticated;

grant select on table
  public.profiles,
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
to authenticated;

grant update on table public.profiles to authenticated;
grant delete on table public.analyses to authenticated;
