-- Run once in the Supabase SQL editor after creating the administrator in
-- Authentication > Users. Replace the example address before running.
do $$
declare
  target_email text := 'replace-with-admin-email@example.com';
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower(target_email) limit 1;
  if target_id is null then raise exception 'Create this administrator in Authentication > Users first'; end if;

  insert into public.profiles (id, email, full_name, role, account_status, onboarding_step, onboarding_completed_at, created_at, updated_at)
  values (target_id, lower(target_email), 'Pilot Administrator', 'admin', 'active', 7, now(), now(), now())
  on conflict (id) do update set role = 'admin', account_status = 'active', onboarding_step = 7,
    onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now()), updated_at = now();

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (target_id, 'administrator.bootstrapped', 'profile', target_id, '{"method":"documented-one-time-sql"}'::jsonb);
end $$;
