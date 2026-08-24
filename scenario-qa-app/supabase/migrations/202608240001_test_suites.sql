create table if not exists public.test_suites (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  test_ids text[] not null check (cardinality(test_ids) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists test_suites_analysis_idx on public.test_suites(analysis_id, created_at);
drop trigger if exists test_suites_updated on public.test_suites;
create trigger test_suites_updated before update on public.test_suites for each row execute function public.set_updated_at();

alter table public.test_suites enable row level security;

create policy test_suites_select_own on public.test_suites for select to authenticated using (user_id = auth.uid());
create policy test_suites_insert_own on public.test_suites for insert to authenticated with check (user_id = auth.uid());
create policy test_suites_update_own on public.test_suites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy test_suites_delete_own on public.test_suites for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on table public.test_suites to authenticated;
