begin;

create extension if not exists pgcrypto;

create type public.user_role as enum ('client', 'coach', 'admin');
create type public.account_status as enum ('invited', 'onboarding', 'active', 'expired', 'suspended', 'archived');
create type public.programme_status as enum ('scheduled', 'active', 'expired', 'paused', 'cancelled');
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'cancelled');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.meal_status as enum ('confirmed', 'needs_review', 'reviewed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (email = lower(email)),
  full_name text,
  phone text,
  avatar_path text,
  role public.user_role not null default 'client',
  account_status public.account_status not null default 'invited',
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 7),
  onboarding_completed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);

create table public.client_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date,
  gender text,
  height_cm numeric(6,2) check (height_cm between 50 and 260),
  current_weight_kg numeric(6,2) check (current_weight_kg between 15 and 500),
  location text,
  dietary_pattern text,
  preferred_cuisines text[] not null default '{}',
  allergies text[] not null default '{}',
  foods_avoided text[] not null default '{}',
  primary_goal text,
  activity_level text,
  workout_frequency text,
  typical_meal_schedule text,
  relevant_health_context text,
  preferred_units text not null default 'metric' check (preferred_units in ('metric', 'imperial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  programme_name text not null,
  primary_goal text,
  starts_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > starts_at),
  status public.programme_status not null default 'scheduled',
  assigned_coach_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid references public.programmes(id) on delete cascade,
  calories_kcal numeric(7,2) check (calories_kcal > 0),
  protein_g numeric(7,2) check (protein_g >= 0),
  carbohydrates_g numeric(7,2) check (carbohydrates_g >= 0),
  fat_g numeric(7,2) check (fat_g >= 0),
  fibre_g numeric(7,2) check (fibre_g >= 0),
  effective_from date not null default current_date,
  effective_until date,
  set_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  full_name text,
  phone text,
  intended_role public.user_role not null default 'client',
  programme_name text,
  primary_goal text,
  programme_starts_at timestamptz,
  programme_expires_at timestamptz,
  assigned_coach_id uuid references public.profiles(id) on delete set null,
  status public.invitation_status not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (programme_expires_at is null or programme_starts_at is null or programme_expires_at > programme_starts_at)
);
create unique index invitations_one_pending_email_idx on public.invitations (email) where status = 'pending';

create table public.coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (coach_id, client_id, starts_at)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.onboarding_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  step smallint not null default 1 check (step between 1 and 7),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid references public.programmes(id) on delete set null,
  meal_type public.meal_type not null,
  title text not null,
  image_path text,
  notes text,
  calories_kcal numeric(8,2) not null check (calories_kcal >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbohydrates_g numeric(8,2) not null check (carbohydrates_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  fibre_g numeric(8,2) not null check (fibre_g >= 0),
  overall_confidence numeric(4,3) not null check (overall_confidence between 0 and 1),
  status public.meal_status not null default 'confirmed',
  analysis_version text not null,
  ai_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meal_entries(id) on delete cascade,
  detected_name text not null,
  canonical_name text,
  serving_label text not null,
  grams numeric(8,2),
  calories_kcal numeric(8,2) not null check (calories_kcal >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbohydrates_g numeric(8,2) not null check (carbohydrates_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  fibre_g numeric(8,2) not null check (fibre_g >= 0),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  nutrition_source text not null
);

create index programmes_client_idx on public.programmes(client_id, created_at desc);
create index programmes_coach_idx on public.programmes(assigned_coach_id) where assigned_coach_id is not null;
create index targets_client_idx on public.nutrition_targets(client_id, effective_from desc);
create index invitations_status_expiry_idx on public.invitations(status, expires_at);
create index coach_assignments_coach_client_idx on public.coach_assignments(coach_id, client_id) where is_active;
create index consent_user_idx on public.consent_records(user_id, consent_type);
create index audit_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);
create index meals_client_created_idx on public.meal_entries(client_id, created_at desc);
create index meal_items_meal_idx on public.meal_items(meal_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger client_profiles_updated before update on public.client_profiles for each row execute function public.set_updated_at();
create trigger programmes_updated before update on public.programmes for each row execute function public.set_updated_at();
create trigger targets_updated before update on public.nutrition_targets for each row execute function public.set_updated_at();
create trigger invitations_updated before update on public.invitations for each row execute function public.set_updated_at();
create trigger onboarding_updated before update on public.onboarding_drafts for each row execute function public.set_updated_at();
create trigger meals_updated before update on public.meal_entries for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin' and p.account_status = 'active');
$$;
create or replace function public.is_assigned_coach(target_client uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_assignments ca where ca.client_id = target_client and ca.coach_id = (select auth.uid()) and ca.is_active and ca.starts_at <= now() and (ca.ends_at is null or ca.ends_at > now()));
$$;
create or replace function public.has_active_access(target_client uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p join public.programmes pr on pr.client_id = p.id
    where p.id = target_client and p.account_status = 'active' and pr.status = 'active' and pr.starts_at <= now() and pr.expires_at > now()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_assigned_coach(uuid) from public;
revoke all on function public.has_active_access(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_assigned_coach(uuid) to authenticated;
grant execute on function public.has_active_access(uuid) to authenticated;

create or replace function public.protect_profile_privileges() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.role is distinct from new.role or old.account_status is distinct from new.account_status or old.email is distinct from new.email)
    and not public.is_admin() then raise exception 'privileged profile fields cannot be changed'; end if;
  return new;
end; $$;
create trigger protect_profile_privileges_before_update before update on public.profiles for each row execute function public.protect_profile_privileges();

alter table public.profiles enable row level security;
alter table public.client_profiles enable row level security;
alter table public.programmes enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.invitations enable row level security;
alter table public.coach_assignments enable row level security;
alter table public.consent_records enable row level security;
alter table public.audit_logs enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.meal_entries enable row level security;
alter table public.meal_items enable row level security;

create policy profiles_select_authorised on public.profiles for select to authenticated using (
  (select auth.uid()) = id or public.is_admin() or public.is_assigned_coach(id)
);
create policy profiles_update_self_or_admin on public.profiles for update to authenticated using (
  (select auth.uid()) = id or public.is_admin()
) with check ((select auth.uid()) = id or public.is_admin());

create policy client_profiles_select_authorised on public.client_profiles for select to authenticated using (
  (select auth.uid()) = user_id or public.is_admin() or public.is_assigned_coach(user_id)
);
create policy client_profiles_insert_self_or_admin on public.client_profiles for insert to authenticated with check (
  (select auth.uid()) = user_id or public.is_admin()
);
create policy client_profiles_update_self_or_admin on public.client_profiles for update to authenticated using (
  (select auth.uid()) = user_id or public.is_admin()
) with check ((select auth.uid()) = user_id or public.is_admin());

create policy programmes_select_authorised on public.programmes for select to authenticated using (
  (select auth.uid()) = client_id or public.is_assigned_coach(client_id) or public.is_admin()
);
create policy programmes_admin_write on public.programmes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy targets_select_authorised on public.nutrition_targets for select to authenticated using (
  (select auth.uid()) = client_id or public.is_assigned_coach(client_id) or public.is_admin()
);
create policy targets_admin_write on public.nutrition_targets for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy invitations_admin_only on public.invitations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy assignments_select_authorised on public.coach_assignments for select to authenticated using (
  (select auth.uid()) in (coach_id, client_id) or public.is_admin()
);
create policy assignments_admin_write on public.coach_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy consents_select_own_or_admin on public.consent_records for select to authenticated using (
  (select auth.uid()) = user_id or public.is_admin()
);
create policy consents_insert_own_or_admin on public.consent_records for insert to authenticated with check (
  (select auth.uid()) = user_id or public.is_admin()
);
create policy consents_revoke_own_or_admin on public.consent_records for update to authenticated using (
  (select auth.uid()) = user_id or public.is_admin()
) with check ((select auth.uid()) = user_id or public.is_admin());

create policy audit_admin_select on public.audit_logs for select to authenticated using (public.is_admin());
create policy audit_admin_insert on public.audit_logs for insert to authenticated with check (public.is_admin() and actor_user_id = (select auth.uid()));

create policy onboarding_own_select on public.onboarding_drafts for select to authenticated using ((select auth.uid()) = user_id);
create policy onboarding_own_insert on public.onboarding_drafts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy onboarding_own_update on public.onboarding_drafts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy meals_select_authorised on public.meal_entries for select to authenticated using (
  (select auth.uid()) = client_id or public.is_assigned_coach(client_id) or public.is_admin()
);
create policy meals_insert_active_client on public.meal_entries for insert to authenticated with check (
  (select auth.uid()) = client_id and public.has_active_access(client_id)
);
create policy meals_update_active_client_or_admin on public.meal_entries for update to authenticated using (
  ((select auth.uid()) = client_id and public.has_active_access(client_id)) or public.is_admin()
) with check (((select auth.uid()) = client_id and public.has_active_access(client_id)) or public.is_admin());
create policy meals_delete_active_client_or_admin on public.meal_entries for delete to authenticated using (
  ((select auth.uid()) = client_id and public.has_active_access(client_id)) or public.is_admin()
);

create policy meal_items_select_authorised on public.meal_items for select to authenticated using (
  exists(select 1 from public.meal_entries m where m.id = meal_id and ((select auth.uid()) = m.client_id or public.is_assigned_coach(m.client_id) or public.is_admin()))
);
create policy meal_items_insert_active_client on public.meal_items for insert to authenticated with check (
  exists(select 1 from public.meal_entries m where m.id = meal_id and (select auth.uid()) = m.client_id and public.has_active_access(m.client_id))
);
create policy meal_items_update_active_client_or_admin on public.meal_items for update to authenticated using (
  exists(select 1 from public.meal_entries m where m.id = meal_id and (((select auth.uid()) = m.client_id and public.has_active_access(m.client_id)) or public.is_admin()))
);
create policy meal_items_delete_active_client_or_admin on public.meal_items for delete to authenticated using (
  exists(select 1 from public.meal_entries m where m.id = meal_id and (((select auth.uid()) = m.client_id and public.has_active_access(m.client_id)) or public.is_admin()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', false, 12582912, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy meal_images_insert_own_active on storage.objects for insert to authenticated with check (
  bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid())::text and public.has_active_access((select auth.uid()))
);
create policy meal_images_select_authorised on storage.objects for select to authenticated using (
  bucket_id = 'meal-images' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
    or public.is_assigned_coach(((storage.foldername(name))[1])::uuid)
  )
);
create policy meal_images_delete_own_active_or_admin on storage.objects for delete to authenticated using (
  bucket_id = 'meal-images' and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and public.has_active_access((select auth.uid())))
    or public.is_admin()
  )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

commit;
