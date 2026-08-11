grant insert on public.requirement_documents to authenticated;

create policy requirement_documents_insert_own
on public.requirement_documents
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.analyses
    where analyses.id = requirement_documents.analysis_id
      and analyses.user_id = (select auth.uid())
  )
);

create policy qa_requirements_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'qa-requirements'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy qa_requirements_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'qa-requirements'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.fail_analysis_document_upload(
  p_analysis_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.analyses
  set status = 'failed',
      process_stage = 'document_failed',
      progress = 100,
      current_message = 'PDF 저장에 실패했습니다.',
      error = jsonb_build_object('code', p_error_code, 'message', 'PDF 저장에 실패했습니다.'),
      completed_at = now()
  where id = p_analysis_id
    and user_id = auth.uid()
    and status = 'queued';
end;
$$;

revoke all on function public.fail_analysis_document_upload(uuid,text) from public;
grant execute on function public.fail_analysis_document_upload(uuid,text) to authenticated;

create or replace function public.set_analysis_dispatch_state(
  p_analysis_id uuid,
  p_status text,
  p_process_stage text,
  p_message text,
  p_error jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('dispatching', 'dispatched', 'dispatch_failed') then
    raise exception 'INVALID_DISPATCH_STATUS';
  end if;
  if p_process_stage not in ('document_analysis', 'page_analysis', 'failed') then
    raise exception 'INVALID_PROCESS_STAGE';
  end if;

  update public.analyses
  set status = p_status,
      process_stage = p_process_stage,
      progress = case when p_status = 'dispatch_failed' then 100 else progress end,
      current_message = p_message,
      error = p_error,
      completed_at = case when p_status = 'dispatch_failed' then now() else completed_at end
  where id = p_analysis_id
    and user_id = auth.uid()
    and status in ('queued', 'dispatching', 'dispatched');
end;
$$;

revoke all on function public.set_analysis_dispatch_state(uuid,text,text,text,jsonb) from public;
grant execute on function public.set_analysis_dispatch_state(uuid,text,text,text,jsonb) to authenticated;
