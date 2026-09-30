-- Migration 34 — close a privilege-escalation hole in staff_roles.
--
-- THE PROBLEM
-- migration-22 replaced the admin-only write policy on staff_roles with:
--     for all to authenticated using (true) with check (true)
-- That lets ANY signed-in account write to staff_roles, including a
-- restricted teacher login. A teacher could update their own row to
-- role = 'admin' and gain full access to families, registrations, parent
-- contact info, and every admin screen.
--
-- The Teacher Access screen is hidden from teachers in the app, but the
-- database is the real boundary — a Netlify function or a direct API call
-- with a valid teacher token bypasses the UI entirely.
--
-- WHY IT GOT LOOSENED IN THE FIRST PLACE
-- The original policy in schema.sql was admin-only, but it checked the
-- role with an inline subquery against staff_roles from inside a policy
-- ON staff_roles. Postgres treats that as infinitely recursive, so every
-- save failed. Opening it to all authenticated made saves work, at the
-- cost of the restriction.
--
-- THE FIX
-- schema.sql already defines is_teacher_role(), a SECURITY DEFINER
-- function that reads staff_roles WITHOUT re-triggering RLS — which is
-- exactly the tool this needs. Using it in the policy restores admin-only
-- writes and does not recurse, so admin saves keep working.
--
-- Recreated here rather than assumed, in case it was never applied.
--
-- Safe to re-run.

create or replace function is_teacher_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_roles where user_id = auth.uid() and role = 'teacher');
$$;
grant execute on function is_teacher_role() to authenticated;

alter table staff_roles enable row level security;

-- Reading stays open to any signed-in staff member. The app needs this on
-- every load to decide which screens to show, and a teacher reading the
-- roles list is not a risk. Only writing is being restricted.
drop policy if exists "staff read staff_roles" on staff_roles;
drop policy if exists "staff read roles" on staff_roles;
create policy "staff read staff_roles" on staff_roles
  for select
  to authenticated
  using (true);

-- Writing is admin-only again.
drop policy if exists "staff write staff_roles" on staff_roles;
drop policy if exists "admins manage roles" on staff_roles;
create policy "admins write staff_roles" on staff_roles
  for all
  to authenticated
  using (not is_teacher_role())
  with check (not is_teacher_role());

-- Verify. Should list the read policy and the admin-only write policy.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'staff_roles'
order by policyname;
