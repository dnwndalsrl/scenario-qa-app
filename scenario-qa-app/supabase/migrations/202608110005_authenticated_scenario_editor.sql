-- Scenario changes originate from a logged-in user. Keep these writes on the
-- user's JWT so row-level security enforces ownership.
grant insert, update on table public.generated_tests to authenticated;
grant insert, delete on table public.generated_test_steps to authenticated;
grant insert, update on table public.test_runs to authenticated;

create policy generated_tests_insert_own on public.generated_tests
  for insert to authenticated with check (user_id = auth.uid());
create policy generated_tests_update_own on public.generated_tests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy generated_test_steps_insert_own on public.generated_test_steps
  for insert to authenticated with check (user_id = auth.uid());
create policy generated_test_steps_delete_own on public.generated_test_steps
  for delete to authenticated using (user_id = auth.uid());

create policy test_runs_insert_own on public.test_runs
  for insert to authenticated with check (user_id = auth.uid());
create policy test_runs_update_own on public.test_runs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
