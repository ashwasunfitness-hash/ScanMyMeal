begin;

alter table public.meal_recognition_results
  add constraint meal_recognition_results_identity_unique
  unique (id, analysis_job_id, client_id, meal_upload_id);

create table public.meal_food_confirmations (
  id uuid primary key,
  analysis_job_id uuid not null,
  recognition_result_id uuid not null,
  meal_upload_id uuid not null,
  client_id uuid not null,
  status text not null default 'confirmed' check (status = 'confirmed'),
  foods jsonb not null check (jsonb_typeof(foods) = 'array' and jsonb_array_length(foods) between 1 and 20),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_food_confirmations_job_owner_fk
    foreign key (analysis_job_id, client_id, meal_upload_id)
    references public.meal_analysis_jobs(id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_food_confirmations_recognition_owner_fk
    foreign key (recognition_result_id, analysis_job_id, client_id, meal_upload_id)
    references public.meal_recognition_results(id, analysis_job_id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_food_confirmations_one_per_job unique (analysis_job_id),
  constraint meal_food_confirmations_one_per_result unique (recognition_result_id)
);

create index meal_food_confirmations_client_created_idx on public.meal_food_confirmations(client_id, created_at desc);

create or replace function public.enforce_completed_meal_food_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.meal_analysis_jobs job
    where job.id = new.analysis_job_id
      and job.client_id = new.client_id
      and job.meal_upload_id = new.meal_upload_id
      and job.status = 'completed'
  ) then raise exception 'food confirmation requires completed analysis'; end if;
  return new;
end; $$;

create trigger meal_food_confirmations_completed_job
  before insert on public.meal_food_confirmations
  for each row execute function public.enforce_completed_meal_food_confirmation();

create or replace function public.prevent_meal_food_confirmation_changes() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'confirmed food lists are immutable'; end; $$;

create trigger meal_food_confirmations_immutable
  before update or delete on public.meal_food_confirmations
  for each row execute function public.prevent_meal_food_confirmation_changes();

alter table public.meal_food_confirmations enable row level security;

create policy meal_food_confirmations_select_authorised
  on public.meal_food_confirmations for select to authenticated using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meal_food_confirmations from anon, authenticated;
grant select on public.meal_food_confirmations to authenticated;

commit;
