create extension if not exists pgcrypto;

create type public.analysis_status as enum (
  'queued','dispatching','dispatched','running','completed','partially_completed',
  'failed','dispatch_failed','cancel_requested','cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_url text not null check (length(target_url) between 1 and 2048),
  normalized_url text not null check (length(normalized_url) between 1 and 2048),
  mode text not null check (mode in ('single_page','site_crawl')),
  max_pages integer not null default 3 check (max_pages between 1 and 5),
  max_depth integer not null default 1 check (max_depth between 0 and 2),
  auto_run_safe_tests boolean not null default true,
  status public.analysis_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  current_message text,
  summary jsonb,
  error jsonb,
  cancel_requested boolean not null default false,
  retry_of uuid references public.analyses(id) on delete set null,
  github_run_id bigint,
  github_run_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.analysis_pages (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, source_id text,
  requested_url text not null, final_url text, title text, depth integer not null default 0,
  status text not null, http_status integer, content_type text, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(analysis_id, source_id)
);
create table public.page_snapshots (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  page_id uuid references public.analysis_pages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  source_id text, payload jsonb not null, created_at timestamptz not null default now()
);
create table public.page_functions (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  page_id uuid references public.analysis_pages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  source_id text, name text not null, description text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.generated_tests (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  page_id uuid references public.analysis_pages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  source_id text, title text not null, safety_level text not null, auto_executable boolean not null default false,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(analysis_id, source_id)
);
create table public.generated_test_steps (
  id uuid primary key default gen_random_uuid(), test_id uuid not null references public.generated_tests(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  step_order integer not null, action text not null, payload jsonb not null default '{}'::jsonb, unique(test_id, step_order)
);
create table public.test_runs (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  test_id uuid references public.generated_tests(id) on delete set null, user_id uuid not null references auth.users(id) on delete cascade,
  source_id text, status text not null, duration_ms integer, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(analysis_id, source_id)
);
create table public.test_step_results (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.test_runs(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  step_order integer not null, status text not null, payload jsonb not null default '{}'::jsonb
);
create table public.analysis_issues (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  page_id uuid references public.analysis_pages(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, severity text not null, title text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.analysis_summaries (
  analysis_id uuid primary key references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, payload jsonb not null, updated_at timestamptz not null default now()
);
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, github_run_id bigint, github_run_url text,
  status text not null, runner_name text, sha text, payload jsonb not null default '{}'::jsonb,
  started_at timestamptz default now(), completed_at timestamptz
);
create table public.artifacts (
  id uuid primary key default gen_random_uuid(), analysis_id uuid not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, source_id text, storage_path text not null unique,
  content_type text not null, size_bytes bigint not null, created_at timestamptz not null default now()
);

create index analyses_user_created_idx on public.analyses(user_id, created_at desc);
create index analyses_status_created_idx on public.analyses(status, created_at);
create index pages_analysis_idx on public.analysis_pages(analysis_id);
create index tests_analysis_idx on public.generated_tests(analysis_id);
create index runs_analysis_idx on public.test_runs(analysis_id);
create index issues_analysis_idx on public.analysis_issues(analysis_id);
create index artifacts_analysis_idx on public.artifacts(analysis_id);

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger analyses_updated before update on public.analyses for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, display_name) values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_pages enable row level security;
alter table public.page_snapshots enable row level security;
alter table public.page_functions enable row level security;
alter table public.generated_tests enable row level security;
alter table public.generated_test_steps enable row level security;
alter table public.test_runs enable row level security;
alter table public.test_step_results enable row level security;
alter table public.analysis_issues enable row level security;
alter table public.analysis_summaries enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.artifacts enable row level security;

create policy profiles_read_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy analyses_read_own on public.analyses for select using (user_id = auth.uid());
create policy analyses_delete_own on public.analyses for delete using (user_id = auth.uid() and status not in ('running','dispatching'));

do $$ declare t text; begin
  foreach t in array array['analysis_pages','page_snapshots','page_functions','generated_tests','generated_test_steps','test_runs','test_step_results','analysis_issues','analysis_summaries','workflow_runs','artifacts'] loop
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_read_own', t);
  end loop;
end $$;

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
  if (select count(*) from public.analyses where user_id=v_user and created_at >= date_trunc('day', now() at time zone 'UTC')) >= 5 then
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
    'dailyLimit', 5,
    'active', count(*) filter(where status in ('queued','dispatching','dispatched','running','cancel_requested')),
    'concurrentLimit', 1
  ) from public.analyses where user_id=auth.uid()
$$;
grant execute on function public.get_usage_summary() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-artifacts','qa-artifacts',false,10485760,array['image/png','application/json','text/html','text/plain'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy qa_artifacts_read_own on storage.objects for select to authenticated
using(bucket_id='qa-artifacts' and (storage.foldername(name))[1]=auth.uid()::text);
