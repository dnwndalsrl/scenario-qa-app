alter table public.ui_audit_reviews
  add column if not exists defect_id uuid,
  add column if not exists defect_payload jsonb;

create unique index if not exists ui_audit_reviews_defect_id_idx
  on public.ui_audit_reviews(defect_id) where defect_id is not null;
