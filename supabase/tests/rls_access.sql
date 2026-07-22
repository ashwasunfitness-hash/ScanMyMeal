begin;

-- Run with `supabase test db` against a local project. These assertions fail closed.
select plan(22);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'programmes', 'programmes exists');
select has_table('public', 'meal_entries', 'meal entries exists');
select has_table('public', 'invitations', 'invitations exists');
select has_table('public', 'coach_feedback', 'coach feedback exists');
select has_table('public', 'meal_uploads', 'meal uploads exists');
select has_table('public', 'meal_analysis_jobs', 'meal analysis jobs exists');
select has_table('public', 'meal_recognition_results', 'meal recognition results exists');
select has_table('public', 'meal_food_confirmations', 'meal food confirmations exists');
select has_table('public', 'meal_portion_confirmations', 'meal portion confirmations exists');
select has_function('public', 'is_admin', array[]::text[], 'admin helper exists');
select has_function('public', 'is_assigned_coach', array['uuid'], 'coach assignment helper exists');
select has_function('public', 'has_active_access', array['uuid'], 'active-access helper exists');
select policies_are('public', 'profiles', array['profiles_select_authorised','profiles_update_self_or_admin'], 'profiles policies are explicit');
select policies_are('public', 'programmes', array['programmes_select_authorised','programmes_admin_write'], 'programmes policies are explicit');
select policies_are('public', 'meal_entries', array['meals_select_authorised','meals_insert_active_client','meals_update_active_client_or_admin','meals_delete_active_client_or_admin'], 'meal policies enforce access');
select policies_are('public', 'coach_feedback', array['feedback_select_authorised','feedback_insert_assigned_coach_or_admin','feedback_update_author_or_admin','feedback_delete_author_or_admin'], 'feedback policies enforce assignment');
select policies_are('public', 'meal_uploads', array['meal_uploads_select_authorised'], 'upload metadata is read-only to authorised users');
select policies_are('public', 'meal_analysis_jobs', array['meal_analysis_jobs_select_authorised'], 'analysis jobs are read-only to authorised users');
select policies_are('public', 'meal_recognition_results', array['meal_recognition_results_select_authorised'], 'recognition results are read-only to authorised users');
select policies_are('public', 'meal_food_confirmations', array['meal_food_confirmations_select_authorised'], 'food confirmations are immutable and readable by authorised users');
select policies_are('public', 'meal_portion_confirmations', array['meal_portion_confirmations_select_authorised'], 'portion confirmations are immutable and readable by authorised users');

select * from finish();
rollback;
