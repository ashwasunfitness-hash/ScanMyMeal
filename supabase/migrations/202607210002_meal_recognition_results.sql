begin;

alter table public.meal_analysis_jobs
  add constraint meal_analysis_jobs_identity_unique
  unique (id, client_id, meal_upload_id);

create table public.meal_recognition_results (
  id uuid primary key,
  analysis_job_id uuid not null,
  client_id uuid not null,
  meal_upload_id uuid not null,
  model_version text not null check (char_length(model_version) between 1 and 120),
  foods jsonb not null check (jsonb_typeof(foods) = 'array' and jsonb_array_length(foods) <= 15),
  image_quality text not null check (image_quality in ('good', 'usable', 'poor')),
  needs_user_confirmation boolean not null default true check (needs_user_confirmation = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_recognition_results_job_owner_fk
    foreign key (analysis_job_id, client_id, meal_upload_id)
    references public.meal_analysis_jobs(id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_recognition_results_one_per_job unique (analysis_job_id)
);

create index meal_recognition_results_client_created_idx
  on public.meal_recognition_results(client_id, created_at desc);

create trigger meal_recognition_results_updated
  before update on public.meal_recognition_results
  for each row execute function public.set_updated_at();

alter table public.meal_recognition_results enable row level security;

create policy meal_recognition_results_select_authorised
  on public.meal_recognition_results
  for select
  to authenticated
  using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meal_recognition_results from anon, authenticated;
grant select on public.meal_recognition_results to authenticated;

commit;
