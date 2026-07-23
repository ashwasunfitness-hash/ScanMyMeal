begin;

alter table public.meal_portion_confirmations
  add constraint meal_portion_confirmations_identity_unique
  unique (id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id);

create table public.meal_nutrition_results (
  id uuid primary key,
  analysis_job_id uuid not null,
  portion_confirmation_id uuid not null,
  food_confirmation_id uuid not null,
  meal_upload_id uuid not null,
  client_id uuid not null,
  status text not null check (status in ('completed', 'partial', 'failed')),
  engine_version text not null check (length(engine_version) between 1 and 120),
  catalogue_version text not null check (length(catalogue_version) between 1 and 120),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  totals jsonb,
  is_complete boolean not null,
  total_confirmed_food_count integer not null check (total_confirmed_food_count between 1 and 20),
  resolved_item_count integer not null check (resolved_item_count between 0 and 20),
  unresolved_item_count integer not null check (unresolved_item_count between 0 and 20),
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_nutrition_results_counts_match check (
    resolved_item_count + unresolved_item_count = total_confirmed_food_count
  ),
  constraint meal_nutrition_results_status_shape check (
    (status = 'completed' and totals is not null and is_complete and unresolved_item_count = 0)
    or (status = 'partial' and totals is not null and not is_complete and resolved_item_count > 0 and unresolved_item_count > 0)
    or (status = 'failed' and totals is null and not is_complete and resolved_item_count = 0)
  ),
  constraint meal_nutrition_results_job_owner_fk
    foreign key (analysis_job_id, client_id, meal_upload_id)
    references public.meal_analysis_jobs(id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_nutrition_results_food_owner_fk
    foreign key (food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    references public.meal_food_confirmations(id, analysis_job_id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_nutrition_results_portion_owner_fk
    foreign key (portion_confirmation_id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    references public.meal_portion_confirmations(id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    on delete cascade,
  constraint meal_nutrition_results_one_per_job unique (analysis_job_id),
  constraint meal_nutrition_results_one_per_portion unique (portion_confirmation_id)
);

create index meal_nutrition_results_client_created_idx on public.meal_nutrition_results(client_id, created_at desc);

create or replace function public.enforce_meal_nutrition_relationships() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.meal_analysis_jobs job
    join public.meal_recognition_results recognition
      on recognition.analysis_job_id = job.id and recognition.client_id = job.client_id and recognition.meal_upload_id = job.meal_upload_id
    join public.meal_food_confirmations food_confirmation
      on food_confirmation.id = new.food_confirmation_id and food_confirmation.recognition_result_id = recognition.id
      and food_confirmation.analysis_job_id = job.id and food_confirmation.client_id = job.client_id and food_confirmation.meal_upload_id = job.meal_upload_id
    join public.meal_portion_confirmations portion_confirmation
      on portion_confirmation.id = new.portion_confirmation_id and portion_confirmation.food_confirmation_id = food_confirmation.id
      and portion_confirmation.analysis_job_id = job.id and portion_confirmation.client_id = job.client_id and portion_confirmation.meal_upload_id = job.meal_upload_id
    where job.id = new.analysis_job_id and job.client_id = new.client_id and job.meal_upload_id = new.meal_upload_id
      and job.status = 'completed' and food_confirmation.status = 'confirmed' and portion_confirmation.status = 'confirmed'
  ) then raise exception 'nutrition result requires completed authoritative confirmations'; end if;
  return new;
end; $$;

create trigger meal_nutrition_results_authoritative_inputs
  before insert on public.meal_nutrition_results
  for each row execute function public.enforce_meal_nutrition_relationships();

create or replace function public.prevent_meal_nutrition_result_changes() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'nutrition results are immutable'; end; $$;

create trigger meal_nutrition_results_immutable
  before update or delete on public.meal_nutrition_results
  for each row execute function public.prevent_meal_nutrition_result_changes();

alter table public.meal_nutrition_results enable row level security;

create policy meal_nutrition_results_select_authorised
  on public.meal_nutrition_results for select to authenticated using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meal_nutrition_results from anon, authenticated;
grant select on public.meal_nutrition_results to authenticated;

commit;
