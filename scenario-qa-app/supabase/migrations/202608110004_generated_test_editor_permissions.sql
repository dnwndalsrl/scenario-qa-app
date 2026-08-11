-- Scenario edits replace the validated step set after updating the scenario.
-- Keep delete access limited to step rows; generated tests remain non-deletable.
grant delete on table public.generated_test_steps to service_role;
