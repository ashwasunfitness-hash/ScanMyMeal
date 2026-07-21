begin;

alter table public.meal_uploads
  add constraint meal_uploads_id_client_unique unique (id, client_id);

create table public.meal_analysis_jobs (
  id uuid primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  meal_upload_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  last_error_code text,
  last_error_message text,
  failure_retryable boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint meal_analysis_jobs_upload_owner_fk
    foreign key (meal_upload_id, client_id)
    references public.meal_uploads(id, client_id)
    on delete cascade,
  constraint meal_analysis_jobs_one_per_upload unique (meal_upload_id),
  constraint meal_analysis_jobs_error_metadata check (
    (status = 'failed' and last_error_code is not null and last_error_message is not null)
    or (status <> 'failed' and last_error_code is null and last_error_message is null and failure_retryable = false)
  )
);

create index meal_analysis_jobs_client_created_idx
  on public.meal_analysis_jobs(client_id, created_at desc);

create trigger meal_analysis_jobs_updated
  before update on public.meal_analysis_jobs
  for each row execute function public.set_updated_at();

alter table public.meal_analysis_jobs enable row level security;

create policy meal_analysis_jobs_select_authorised
  on public.meal_analysis_jobs
  for select
  to authenticated
  using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meal_analysis_jobs from anon, authenticated;
grant select on public.meal_analysis_jobs to authenticated;

commit;
