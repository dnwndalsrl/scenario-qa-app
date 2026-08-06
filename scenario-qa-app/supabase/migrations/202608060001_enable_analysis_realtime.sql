do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'analyses'
  ) then
    alter publication supabase_realtime add table public.analyses;
  end if;
end;
$$;

alter table public.analyses replica identity full;
