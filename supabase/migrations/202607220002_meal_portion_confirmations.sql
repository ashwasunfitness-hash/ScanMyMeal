begin;

alter table public.meal_food_confirmations
  add constraint meal_food_confirmations_identity_unique
  unique (id, analysis_job_id, client_id, meal_upload_id);

create table public.meal_portion_confirmations (
  id uuid primary key,
  analysis_job_id uuid not null,
  food_confirmation_id uuid not null,
  meal_upload_id uuid not null,
  client_id uuid not null,
  status text not null default 'confirmed' check (status = 'confirmed'),
  portions jsonb not null check (jsonb_typeof(portions) = 'array' and jsonb_array_length(portions) between 1 and 20),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_portion_confirmations_job_owner_fk
    foreign key (analysis_job_id, client_id, meal_upload_id)
    references public.meal_analysis_jobs(id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_portion_confirmations_food_owner_fk
    foreign key (food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    references public.meal_food_confirmations(id, analysis_job_id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_portion_confirmations_one_per_job unique (analysis_job_id),
  constraint meal_portion_confirmations_one_per_food_confirmation unique (food_confirmation_id)
);

create index meal_portion_confirmations_client_created_idx on public.meal_portion_confirmations(client_id, created_at desc);

create or replace function public.enforce_completed_meal_portion_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.meal_analysis_jobs job
    join public.meal_food_confirmations food_confirmation
      on food_confirmation.id = new.food_confirmation_id
      and food_confirmation.analysis_job_id = job.id
      and food_confirmation.client_id = job.client_id
      and food_confirmation.meal_upload_id = job.meal_upload_id
    join public.meal_recognition_results recognition
      on recognition.id = food_confirmation.recognition_result_id
      and recognition.analysis_job_id = job.id
      and recognition.client_id = job.client_id
      and recognition.meal_upload_id = job.meal_upload_id
    where job.id = new.analysis_job_id
      and job.client_id = new.client_id
      and job.meal_upload_id = new.meal_upload_id
      and job.status = 'completed'
  ) then raise exception 'portion confirmation requires completed confirmed foods'; end if;
  return new;
end; $$;

create trigger meal_portion_confirmations_completed_foods
  before insert on public.meal_portion_confirmations
  for each row execute function public.enforce_completed_meal_portion_confirmation();

create or replace function public.prevent_meal_portion_confirmation_changes() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'confirmed portions are immutable'; end; $$;

create trigger meal_portion_confirmations_immutable
  before update or delete on public.meal_portion_confirmations
  for each row execute function public.prevent_meal_portion_confirmation_changes();

alter table public.meal_portion_confirmations enable row level security;

create policy meal_portion_confirmations_select_authorised
  on public.meal_portion_confirmations for select to authenticated using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meal_portion_confirmations from anon, authenticated;
grant select on public.meal_portion_confirmations to authenticated;

commit;
