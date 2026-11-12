-- Migration 44 — safe class registration (step 2 of 2).
--
-- RUN THIS ONLY AFTER:
--   1. migration-43 has been run,
--   2. the new shine-public code is live, and
--   3. you have done one test registration on the live site and it worked.
--
-- This closes the old path. Until now the public could still write
-- families, students, enrollments and registrations straight into the
-- database, which is what let a class be overfilled or fake records be
-- added. After this, the only way in is register_student() (migration
-- 43), which does every check itself.
--
-- If the new public code is NOT live when this runs, registration on the
-- website stops working until it is. Nothing is lost, and nothing changes
-- for signed-in staff in the admin.
--
-- Safe to re-run.

drop policy if exists "public can insert families" on families;
drop policy if exists "public insert families" on families;
drop policy if exists "public can insert students" on students;
drop policy if exists "public insert students" on students;
drop policy if exists "public can insert enrollments" on enrollments;
drop policy if exists "public insert enrollments" on enrollments;
drop policy if exists "public can submit registration" on registrations;
drop policy if exists "public insert registrations" on registrations;

-- Verify. Should return NO rows: no public write rule left on these four.
select tablename, policyname, cmd from pg_policies
where tablename in ('families', 'students', 'enrollments', 'registrations')
  and cmd = 'INSERT' and coalesce(with_check, '') not like '%authenticated%';
