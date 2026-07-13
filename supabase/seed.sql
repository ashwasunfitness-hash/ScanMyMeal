-- Synthetic local-development data only. Create auth users first with `scripts/bootstrap-local-users.mjs`.
-- These fixed UUIDs and example.test addresses must never be used for real clients.

insert into public.profiles (id, email, full_name, role, account_status, onboarding_completed_at)
values
  ('10000000-0000-4000-8000-000000000001', 'admin@scanmymeal.example.test', 'Asha Admin', 'admin', 'active', now()),
  ('10000000-0000-4000-8000-000000000002', 'coach@scanmymeal.example.test', 'Kiran Coach', 'coach', 'active', now()),
  ('10000000-0000-4000-8000-000000000003', 'active.client@scanmymeal.example.test', 'Meera Sample', 'client', 'active', now()),
  ('10000000-0000-4000-8000-000000000004', 'expired.client@scanmymeal.example.test', 'Rohan Sample', 'client', 'expired', now())
on conflict (id) do nothing;

insert into public.programmes (client_id, programme_name, primary_goal, starts_at, expires_at, status, assigned_coach_id, created_by)
values
  ('10000000-0000-4000-8000-000000000003', 'Whole-food wellness', 'Improved meal quality', now() - interval '14 days', now() + interval '76 days', 'active', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000004', 'Foundations', 'General fitness', now() - interval '120 days', now() - interval '30 days', 'expired', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');

insert into public.coach_assignments (coach_id, client_id, assigned_by)
values ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001');

insert into public.invitations (email, full_name, intended_role, programme_name, primary_goal, programme_starts_at, programme_expires_at, assigned_coach_id, status, invited_by)
values ('pending.client@scanmymeal.example.test', 'Neel Sample', 'client', 'Whole-food wellness', 'Fat loss support', now(), now() + interval '90 days', '10000000-0000-4000-8000-000000000002', 'pending', '10000000-0000-4000-8000-000000000001')
on conflict do nothing;
