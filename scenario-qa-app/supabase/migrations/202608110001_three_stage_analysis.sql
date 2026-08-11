alter table public.analyses
  add column if not exists process_stage text not null default 'page_analysis'
    check (process_stage in ('document_analysis','page_analysis','scenario_review','test_execution','report_complete','document_failed','failed')),
  add column if not exists scenarios_approved_at timestamptz;

create table if not exists public.requirement_documents (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  status text not null check (status in ('pending','processing','completed','failed','ignored')),
  payload jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requirement_documents enable row level security;
create policy requirement_documents_read_own on public.requirement_documents for select using (user_id = auth.uid());
grant select on public.requirement_documents to authenticated;
grant all on public.requirement_documents to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qa-requirements','qa-requirements',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.send_analysis_realtime_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'process_stage', new.process_stage,
      'scenarios_approved_at', new.scenarios_approved_at,
      'progress', new.progress,
      'current_message', new.current_message,
      'error', new.error,
      'started_at', new.started_at,
      'completed_at', new.completed_at,
      'updated_at', new.updated_at
    ),
    'UPDATE',
    'analysis:' || new.id::text,
    true
  );
  return null;
end;
$$;
