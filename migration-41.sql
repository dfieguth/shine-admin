-- Migration 41 — security tightening from the November audit.
--
-- RUN THIS IN SUPABASE BEFORE PUSHING THE NEW shine-admin CODE.
-- Nothing here changes what Corrie or any other admin can do.
--
-- 1. meeting_reminders_sent had no row level security at all, so anyone
--    holding the public site key could read it, add rows (which makes the
--    system think a parent-meeting reminder already went out, so it never
--    sends) or delete rows (which makes it send again). Security is now
--    switched on with no rules for the public or for logins. The reminder
--    function uses the service key, which is not affected.
--
-- 2. Teacher logins were limited only by which screens the app shows
--    them. In the database itself they could still read recital
--    reservations (family emails and phones), the interest list and the
--    volunteer roster, and could change Privacy Settings and the recital
--    settings and shows. None of the screens a teacher can be given uses
--    those tables, so they are now admin-only, the same way Families and
--    Registrations already are. Teachers can still READ privacy settings,
--    because printing a roster depends on them.
--
-- 3. Three ticket-count functions had no fixed search path (Supabase
--    flags this). Set to public, matching every other function here.
--
-- Safe to re-run.

-- 1 -------------------------------------------------------------------
alter table meeting_reminders_sent enable row level security;

-- 2 -------------------------------------------------------------------
drop policy if exists "staff manage reservations" on ticket_reservations;
drop policy if exists "admins only reservations" on ticket_reservations;
create policy "admins only reservations" on ticket_reservations for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff full access contact interest" on contact_interest;
drop policy if exists "admins only contact interest" on contact_interest;
create policy "admins only contact interest" on contact_interest for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff full access volunteers roster" on volunteers;
drop policy if exists "admins only volunteers roster" on volunteers;
create policy "admins only volunteers roster" on volunteers for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff full access privacy" on privacy_settings;
drop policy if exists "staff read privacy" on privacy_settings;
drop policy if exists "admins write privacy" on privacy_settings;
create policy "staff read privacy" on privacy_settings for select
  using (auth.role() = 'authenticated');
create policy "admins write privacy" on privacy_settings for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

-- The public "read settings" and "read active shows" rules stay as they are.
drop policy if exists "staff manage settings" on recital_settings;
drop policy if exists "admins manage settings" on recital_settings;
create policy "admins manage settings" on recital_settings for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff manage shows" on recital_shows;
drop policy if exists "admins manage shows" on recital_shows;
create policy "admins manage shows" on recital_shows for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

-- Volunteer sign-ups are admin-only (migration 9). This removes an older,
-- wider rule from the original schema if it is still there. In a database
-- where migration 9 ran in full it is already gone and this does nothing.
drop policy if exists "staff full access volunteers" on volunteer_inquiries;

-- 3 -------------------------------------------------------------------
alter function ticket_counts_by_show() set search_path = public;
alter function ticket_count_combined() set search_path = public;
alter function ticket_count_for_email(text, uuid) set search_path = public;

-- Verify. First result: one row, rls_on = true.
-- Second result: the ten rules below, and nothing named "staff manage ..."
-- or "staff full access ...".
select relname, relrowsecurity as rls_on from pg_class where relname = 'meeting_reminders_sent';
select tablename, policyname, cmd from pg_policies
where tablename in ('ticket_reservations', 'contact_interest', 'volunteers', 'volunteer_inquiries', 'privacy_settings', 'recital_settings', 'recital_shows')
order by tablename, policyname;
