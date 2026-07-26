begin;

alter table public.meal_nutrition_results
  add constraint meal_nutrition_results_saved_identity_unique
  unique (id, portion_confirmation_id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id);

create table public.meals (
  id uuid primary key,
  client_id uuid not null references public.profiles(id) on delete cascade,
  meal_upload_id uuid not null,
  meal_analysis_job_id uuid not null,
  food_confirmation_id uuid not null,
  portion_confirmation_id uuid not null,
  nutrition_result_id uuid not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout', 'other')),
  eaten_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint meals_upload_owner_fk
    foreign key (meal_upload_id, client_id)
    references public.meal_uploads(id, client_id)
    on delete restrict,
  constraint meals_job_owner_fk
    foreign key (meal_analysis_job_id, client_id, meal_upload_id)
    references public.meal_analysis_jobs(id, client_id, meal_upload_id)
    on delete restrict,
  constraint meals_food_owner_fk
    foreign key (food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id)
    references public.meal_food_confirmations(id, analysis_job_id, client_id, meal_upload_id)
    on delete restrict,
  constraint meals_portion_owner_fk
    foreign key (portion_confirmation_id, food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id)
    references public.meal_portion_confirmations(id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    on delete restrict,
  constraint meals_nutrition_owner_fk
    foreign key (nutrition_result_id, portion_confirmation_id, food_confirmation_id, meal_analysis_job_id, client_id, meal_upload_id)
    references public.meal_nutrition_results(id, portion_confirmation_id, food_confirmation_id, analysis_job_id, client_id, meal_upload_id)
    on delete restrict,
  constraint meals_one_per_upload unique (meal_upload_id),
  constraint meals_one_per_job unique (meal_analysis_job_id),
  constraint meals_one_per_food_confirmation unique (food_confirmation_id),
  constraint meals_one_per_portion_confirmation unique (portion_confirmation_id),
  constraint meals_one_per_nutrition_result unique (nutrition_result_id)
);

create index meals_client_eaten_idx on public.meals(client_id, eaten_at desc);

create or replace function public.enforce_saved_meal_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.eaten_at > now() + interval '10 minutes'
    or new.eaten_at < now() - interval '30 days' then
    raise exception 'saved meal eaten time is outside the allowed range';
  end if;
  if not public.has_active_access(new.client_id) then
    raise exception 'saved meal requires active client access';
  end if;
  if not exists (
    select 1
    from public.meal_uploads upload
    join public.meal_analysis_jobs job
      on job.id = new.meal_analysis_job_id and job.client_id = upload.client_id and job.meal_upload_id = upload.id
    join public.meal_food_confirmations food_confirmation
      on food_confirmation.id = new.food_confirmation_id and food_confirmation.analysis_job_id = job.id
      and food_confirmation.client_id = job.client_id and food_confirmation.meal_upload_id = upload.id
    join public.meal_portion_confirmations portion_confirmation
      on portion_confirmation.id = new.portion_confirmation_id and portion_confirmation.food_confirmation_id = food_confirmation.id
      and portion_confirmation.analysis_job_id = job.id and portion_confirmation.client_id = job.client_id
      and portion_confirmation.meal_upload_id = upload.id
    join public.meal_nutrition_results nutrition_result
      on nutrition_result.id = new.nutrition_result_id and nutrition_result.portion_confirmation_id = portion_confirmation.id
      and nutrition_result.food_confirmation_id = food_confirmation.id and nutrition_result.analysis_job_id = job.id
      and nutrition_result.client_id = job.client_id and nutrition_result.meal_upload_id = upload.id
    where upload.id = new.meal_upload_id and upload.client_id = new.client_id and upload.upload_status = 'uploaded'
      and job.status = 'completed' and food_confirmation.status = 'confirmed' and portion_confirmation.status = 'confirmed'
      and nutrition_result.status in ('completed', 'partial', 'failed')
  ) then raise exception 'saved meal requires one completed authoritative record chain'; end if;
  return new;
end; $$;

create trigger meals_authoritative_chain
  before insert on public.meals
  for each row execute function public.enforce_saved_meal_chain();

create or replace function public.prevent_saved_meal_changes() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'saved meals are immutable'; end; $$;

create trigger meals_immutable
  before update or delete on public.meals
  for each row execute function public.prevent_saved_meal_changes();

alter table public.meals enable row level security;

create policy meals_select_authorised
  on public.meals for select to authenticated using (
    (select auth.uid()) = client_id
    or public.is_assigned_coach(client_id)
    or public.is_admin()
  );

revoke all on public.meals from anon, authenticated;
grant select on public.meals to authenticated;

commit;
