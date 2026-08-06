drop policy if exists analysis_owners_receive_updates on realtime.messages;

create policy analysis_owners_receive_updates
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.analyses
    where user_id = auth.uid()
      and realtime.topic() = 'analysis:' || id::text
  )
);

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

drop trigger if exists analyses_realtime_broadcast on public.analyses;
create trigger analyses_realtime_broadcast
after update on public.analyses
for each row execute function public.send_analysis_realtime_update();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'analyses'
  ) then
    alter publication supabase_realtime drop table public.analyses;
  end if;
end;
$$;
