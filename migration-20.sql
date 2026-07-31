-- Migration 20 — confirm/restore public INSERT access on enrollments.
--
-- NOT confirmed necessary yet — this is a candidate fix for the "Lucy
-- didn't appear on the roster" bug, to run ONLY IF the diagnostic step in
-- shine-upgrade-27.md shows a real error on the enrollments insert (check
-- the browser console during a test registration first).
--
-- Per shine-03-DATABASE-REFERENCE-v2.md, families/students/enrollments were
-- all supposed to get a public (anon) INSERT-only policy in an earlier
-- round. The Gmail secrets and the registration webhook both turned out to
-- be documented as done without actually existing live — so it's worth
-- directly confirming this one instead of assuming the doc is accurate.
--
-- Safe to run whether or not the policy already exists.

drop policy if exists "public insert enrollments" on enrollments;
create policy "public insert enrollments" on enrollments
  for insert
  to anon
  with check (true);
