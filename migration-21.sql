-- Migration 21 — restore public (anon) INSERT access on families, students,
-- and registrations.
--
-- WHY: migration-20 only restored this policy on `enrollments`. But instant
-- registration needs to insert into FOUR tables as an anonymous visitor:
-- registrations, families, students, and enrollments. Charlie's test
-- registration produced a success screen and a confirmation email while
-- nothing appeared in the admin, which is the signature of the families
-- and students inserts being rejected while the registrations log insert
-- succeeded.
--
-- shine-03-DATABASE-REFERENCE-v2.md documents all of these as already
-- existing. That document has now been wrong three times (Gmail secrets,
-- the registration webhook, and the enrollments policy), so this restores
-- them explicitly rather than trusting the doc again.
--
-- This is INSERT-only in every case. Nobody's ability to READ private data
-- changes: the public still cannot select from any of these tables. This is
-- the same deliberate, documented tradeoff that made instant registration
-- possible in the first place.
--
-- Safe to run whether or not these policies already exist.

drop policy if exists "public insert registrations" on registrations;
create policy "public insert registrations" on registrations
  for insert
  to anon
  with check (true);

drop policy if exists "public insert families" on families;
create policy "public insert families" on families
  for insert
  to anon
  with check (true);

drop policy if exists "public insert students" on students;
create policy "public insert students" on students
  for insert
  to anon
  with check (true);

-- Verify what's actually in place after running the above. Every one of
-- these four tables should appear with cmd = INSERT and roles = {anon}.
-- If any are missing from these results, that table is still blocked.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('registrations', 'families', 'students', 'enrollments')
  and cmd = 'INSERT'
order by tablename;
