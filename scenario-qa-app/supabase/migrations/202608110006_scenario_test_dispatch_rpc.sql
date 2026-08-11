create or replace function public.set_scenario_test_dispatch_state(
  p_analysis_id uuid,
  p_status text,
  p_message text,
  p_error jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('dispatching', 'dispatched', 'dispatch_failed') then
    raise exception 'INVALID_DISPATCH_STATUS';
  end if;

  update public.analyses
  set status = p_status::public.analysis_status,
      process_stage = case when p_status = 'dispatch_failed' then 'failed' else 'test_execution' end,
      progress = case when p_status = 'dispatch_failed' then 100 else 85 end,
      current_message = p_message,
      error = p_error,
      scenarios_approved_at = case when p_status = 'dispatching' then now() else scenarios_approved_at end,
      completed_at = case when p_status = 'dispatching' then null when p_status = 'dispatch_failed' then now() else completed_at end
  where id = p_analysis_id
    and user_id = auth.uid()
    and (
      (p_status = 'dispatching' and process_stage = 'scenario_review' and status in ('completed', 'partially_completed', 'failed'))
      or (p_status = 'dispatched' and process_stage = 'test_execution' and status = 'dispatching')
      or (p_status = 'dispatch_failed' and process_stage = 'test_execution' and status in ('dispatching', 'dispatched'))
    );

  if not found then raise exception 'INVALID_ANALYSIS_TRANSITION'; end if;
end;
$$;

revoke all on function public.set_scenario_test_dispatch_state(uuid,text,text,jsonb) from public;
grant execute on function public.set_scenario_test_dispatch_state(uuid,text,text,jsonb) to authenticated;
