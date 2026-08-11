create or replace function public.set_analysis_dispatch_state(
  p_analysis_id uuid,
  p_status text,
  p_process_stage text,
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
  if p_process_stage not in ('document_analysis', 'page_analysis', 'failed') then
    raise exception 'INVALID_PROCESS_STAGE';
  end if;

  update public.analyses
  set status = p_status::public.analysis_status,
      process_stage = p_process_stage,
      progress = case when p_status = 'dispatch_failed' then 100 else progress end,
      current_message = p_message,
      error = p_error,
      completed_at = case when p_status = 'dispatch_failed' then now() else completed_at end
  where id = p_analysis_id
    and user_id = auth.uid()
    and status in ('queued', 'dispatching', 'dispatched');
end;
$$;

revoke all on function public.set_analysis_dispatch_state(uuid,text,text,text,jsonb) from public;
grant execute on function public.set_analysis_dispatch_state(uuid,text,text,text,jsonb) to authenticated;
