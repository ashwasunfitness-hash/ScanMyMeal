begin;

create table public.coach_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete restrict,
  meal_id uuid references public.meal_entries(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  is_client_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coach_feedback_client_created_idx on public.coach_feedback(client_id, created_at desc);
create trigger coach_feedback_updated before update on public.coach_feedback for each row execute function public.set_updated_at();
alter table public.coach_feedback enable row level security;

create policy feedback_select_authorised on public.coach_feedback for select to authenticated using (
  ((select auth.uid()) = client_id and is_client_visible)
  or public.is_assigned_coach(client_id)
  or public.is_admin()
);
create policy feedback_insert_assigned_coach_or_admin on public.coach_feedback for insert to authenticated with check (
  (public.is_assigned_coach(client_id) and coach_id = (select auth.uid())) or public.is_admin()
);
create policy feedback_update_author_or_admin on public.coach_feedback for update to authenticated using (
  coach_id = (select auth.uid()) or public.is_admin()
) with check (coach_id = (select auth.uid()) or public.is_admin());
create policy feedback_delete_author_or_admin on public.coach_feedback for delete to authenticated using (
  coach_id = (select auth.uid()) or public.is_admin()
);

grant select, insert, update, delete on public.coach_feedback to authenticated;
commit;
