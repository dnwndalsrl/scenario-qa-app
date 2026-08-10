create or replace function public.create_analysis_job(
  p_target_url text, p_normalized_url text, p_mode text default 'single_page',
  p_max_pages integer default 3, p_max_depth integer default 1,
  p_auto_run boolean default true, p_retry_of uuid default null
) returns public.analyses language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_job public.analyses;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  perform pg_advisory_xact_lock(hashtext('probe-qa-global'));
  update public.analyses set status='failed', progress=100,
    current_message='실행 제한 시간을 초과해 종료되었습니다.',
    error=jsonb_build_object('code','RUNNER_STALE','message','15분 이상 상태 갱신이 없습니다.'),
    completed_at=now()
  where status in ('queued','dispatching','dispatched','running','cancel_requested') and updated_at < now() - interval '15 minutes';
  if (select count(*) from public.analyses where user_id=v_user and created_at >= date_trunc('day', now() at time zone 'UTC')) >= 20 then
    raise exception 'DAILY_LIMIT_REACHED' using errcode='P0001';
  end if;
  if exists(select 1 from public.analyses where user_id=v_user and status in ('queued','dispatching','dispatched','running','cancel_requested')) then
    raise exception 'USER_CONCURRENCY_LIMIT' using errcode='P0001';
  end if;
  if (select count(*) from public.analyses where status in ('queued','dispatching','dispatched','running','cancel_requested')) >= 1 then
    raise exception 'GLOBAL_QUEUE_LIMIT' using errcode='P0001';
  end if;
  if p_mode not in ('single_page','site_crawl') or p_max_pages not between 1 and 5 or p_max_depth not between 0 and 2 then
    raise exception 'INVALID_ANALYSIS_OPTIONS' using errcode='P0001';
  end if;
  insert into public.analyses(user_id,target_url,normalized_url,mode,max_pages,max_depth,auto_run_safe_tests,retry_of,current_message)
  values(v_user,p_target_url,p_normalized_url,p_mode,p_max_pages,p_max_depth,p_auto_run,p_retry_of,'실행 대기열에 등록되었습니다.') returning * into v_job;
  return v_job;
end $$;
revoke all on function public.create_analysis_job(text,text,text,integer,integer,boolean,uuid) from public;
grant execute on function public.create_analysis_job(text,text,text,integer,integer,boolean,uuid) to authenticated;

create or replace function public.get_usage_summary() returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'dailyUsed', count(*) filter(where created_at >= date_trunc('day', now() at time zone 'UTC')),
    'dailyLimit', 20,
    'active', count(*) filter(where status in ('queued','dispatching','dispatched','running','cancel_requested')),
    'concurrentLimit', 1
  ) from public.analyses where user_id=auth.uid()
$$;
grant execute on function public.get_usage_summary() to authenticated;
