create table if not exists public.ui_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_url text not null,
  normalized_url text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  viewport_preset text not null check (viewport_preset in ('mobile','tablet','desktop')),
  viewport_width integer not null check (viewport_width between 320 and 2560),
  viewport_height integer not null check (viewport_height between 320 and 1600),
  has_reference boolean not null default false,
  current_message text not null default 'UI 점검 실행 대기 중입니다.',
  summary jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.ui_design_references (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null unique references public.ui_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/png','image/jpeg')),
  width integer not null check (width > 0 and width <= 10000),
  height integer not null check (height > 0 and height <= 20000),
  created_at timestamptz not null default now()
);

create table if not exists public.ui_audit_artifacts (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.ui_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  state text not null,
  storage_path text not null unique,
  width integer not null,
  height integer not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),
  unique(audit_id,source_id)
);

create table if not exists public.ui_audit_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.ui_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null check (rule in ('horizontal_overflow','clipped_content','element_overlap','small_target','low_contrast')),
  severity text not null check (severity in ('low','medium','high')),
  title text not null,
  message text not null,
  selector text not null,
  state text not null,
  artifact_source_id text,
  actual jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ui_audits enable row level security;
alter table public.ui_design_references enable row level security;
alter table public.ui_audit_artifacts enable row level security;
alter table public.ui_audit_issues enable row level security;
create policy ui_audits_read_own on public.ui_audits for select to authenticated using (user_id = (select auth.uid()));
create policy ui_audits_delete_own on public.ui_audits for delete to authenticated using (user_id = (select auth.uid()) and status = 'queued');
create policy ui_design_references_read_own on public.ui_design_references for select to authenticated using (user_id = (select auth.uid()));
create policy ui_design_references_insert_own on public.ui_design_references for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.ui_audits where id = audit_id and user_id = (select auth.uid()) and status = 'queued')
);
create policy ui_audit_artifacts_read_own on public.ui_audit_artifacts for select to authenticated using (user_id = (select auth.uid()));
create policy ui_audit_issues_read_own on public.ui_audit_issues for select to authenticated using (user_id = (select auth.uid()));
grant select, delete on table public.ui_audits to authenticated;
grant select, insert on table public.ui_design_references to authenticated;
grant select on table public.ui_audit_artifacts, public.ui_audit_issues to authenticated;
grant all on table public.ui_audits, public.ui_design_references, public.ui_audit_artifacts, public.ui_audit_issues to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-ui-designs','qa-ui-designs',false,10485760,array['image/png','image/jpeg'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy qa_ui_designs_read_own on storage.objects for select to authenticated using (bucket_id='qa-ui-designs' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy qa_ui_designs_insert_own on storage.objects for insert to authenticated with check (bucket_id='qa-ui-designs' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy qa_ui_designs_delete_own on storage.objects for delete to authenticated using (bucket_id='qa-ui-designs' and (storage.foldername(name))[1]=(select auth.uid()::text));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-ui-audit-artifacts','qa-ui-audit-artifacts',false,10485760,array['image/png'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy qa_ui_audit_artifacts_read_own on storage.objects for select to authenticated using (bucket_id='qa-ui-audit-artifacts' and (storage.foldername(name))[1]=(select auth.uid()::text));

create or replace function public.create_ui_audit(
  p_target_url text, p_normalized_url text, p_name text, p_viewport_preset text,
  p_viewport_width integer, p_viewport_height integer, p_has_reference boolean
)
returns table(id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_viewport_preset not in ('mobile','tablet','desktop') then raise exception 'INVALID_VIEWPORT'; end if;
  insert into public.ui_audits(user_id,name,target_url,normalized_url,viewport_preset,viewport_width,viewport_height,has_reference)
  values(v_user_id,left(trim(p_name),80),p_target_url,p_normalized_url,p_viewport_preset,p_viewport_width,p_viewport_height,p_has_reference)
  returning ui_audits.id into v_id;
  return query select v_id;
end;
$$;
revoke all on function public.create_ui_audit(text,text,text,text,integer,integer,boolean) from public;
grant execute on function public.create_ui_audit(text,text,text,text,integer,integer,boolean) to authenticated;
