create table if not exists public.ui_audit_reviews (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.ui_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule text not null check (rule in ('horizontal_overflow','clipped_content','element_overlap','small_target','low_contrast')),
  status text not null default 'unreviewed' check (status in ('unreviewed','fix_required','false_positive','deferred')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(audit_id, rule)
);

alter table public.ui_audit_reviews enable row level security;
create policy ui_audit_reviews_read_own on public.ui_audit_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy ui_audit_reviews_insert_own on public.ui_audit_reviews for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.ui_audits where id = audit_id and user_id = (select auth.uid()))
);
create policy ui_audit_reviews_update_own on public.ui_audit_reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on table public.ui_audit_reviews to authenticated;
grant all on table public.ui_audit_reviews to service_role;
