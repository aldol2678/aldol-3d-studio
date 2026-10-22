-- Only the two synthetic test users created for the 2026-10-22 Studio QA.
begin;
delete from public.studio_activity_logs where owner_id in ('78905df8-43a4-4f42-8b83-8fe8407059d1','de7be465-ea39-4c5b-8e02-06deabb762f8');
delete from public.studio_revisions where owner_id in ('78905df8-43a4-4f42-8b83-8fe8407059d1','de7be465-ea39-4c5b-8e02-06deabb762f8');
delete from public.studio_projects where owner_id in ('78905df8-43a4-4f42-8b83-8fe8407059d1','de7be465-ea39-4c5b-8e02-06deabb762f8');
delete from auth.users where id in ('78905df8-43a4-4f42-8b83-8fe8407059d1','de7be465-ea39-4c5b-8e02-06deabb762f8') and email like 'studio-qa-%@example.invalid';
commit;
