alter table public.analyses
  add column if not exists authentication_enabled boolean not null default false;

create table if not exists public.analysis_authentications (
  analysis_id uuid primary key references public.analyses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  login_url text not null check (length(login_url) between 1 and 2048),
  username_hint text not null check (length(username_hint) between 1 and 80),
  encrypted_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.analysis_authentications enable row level security;

-- Credentials are deliberately unavailable to browser clients. Only the
-- trusted Vercel API and GitHub Actions runner use the service role.
revoke all on table public.analysis_authentications from anon, authenticated;
grant select, insert, delete on table public.analysis_authentications to service_role;

create index if not exists analysis_authentications_user_idx
  on public.analysis_authentications(user_id, created_at desc);
