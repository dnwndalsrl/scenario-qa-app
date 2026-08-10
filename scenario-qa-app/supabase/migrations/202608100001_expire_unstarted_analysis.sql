create or replace function public.expire_stale_analysis(p_analysis_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.analyses
  set
    status = 'failed',
    progress = 100,
    current_message = case
      when status = 'running' then '실행 제한 시간을 초과해 종료되었습니다.'
      else '실행기가 분석을 시작하지 못했습니다.'
    end,
    error = case
      when status = 'running' then jsonb_build_object(
        'code', 'RUNNER_STALE',
        'message', '15분 이상 상태 갱신이 없어 중단된 작업으로 처리했습니다.'
      )
      else jsonb_build_object(
        'code', 'RUNNER_NOT_STARTED',
        'message', '5분 안에 실행기가 시작되지 않았습니다. GitHub Actions 실행 로그와 Supabase 연결 설정을 확인해 주세요.'
      )
    end,
    completed_at = now(),
    updated_at = now()
  where id = p_analysis_id
    and user_id = auth.uid()
    and (
      (status = 'running' and updated_at < now() - interval '15 minutes')
      or
      (status in ('queued', 'dispatching', 'dispatched', 'cancel_requested') and updated_at < now() - interval '5 minutes')
    );

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.expire_stale_analysis(uuid) from public;
grant execute on function public.expire_stale_analysis(uuid) to authenticated;
