begin;

-- Run with `supabase test db` against a local project. These assertions fail closed.
select plan(14);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'programmes', 'programmes exists');
select has_table('public', 'meal_entries', 'meal entries exists');
select has_table('public', 'invitations', 'invitations exists');
select has_table('public', 'coach_feedback', 'coach feedback exists');
select has_table('public', 'meal_uploads', 'meal uploads exists');
select has_function('public', 'is_admin', array[]::text[], 'admin helper exists');
select has_function('public', 'is_assigned_coach', array['uuid'], 'coach assignment helper exists');
select has_function('public', 'has_active_access', array['uuid'], 'active-access helper exists');
select policies_are('public', 'profiles', array['profiles_select_authorised','profiles_update_self_or_admin'], 'profiles policies are explicit');
select policies_are('public', 'programmes', array['programmes_select_authorised','programmes_admin_write'], 'programmes policies are explicit');
select policies_are('public', 'meal_entries', array['meals_select_authorised','meals_insert_active_client','meals_update_active_client_or_admin','meals_delete_active_client_or_admin'], 'meal policies enforce access');
select policies_are('public', 'coach_feedback', array['feedback_select_authorised','feedback_insert_assigned_coach_or_admin','feedback_update_author_or_admin','feedback_delete_author_or_admin'], 'feedback policies enforce assignment');
select policies_are('public', 'meal_uploads', array['meal_uploads_select_authorised'], 'upload metadata is read-only to authorised users');

select * from finish();
rollback;
