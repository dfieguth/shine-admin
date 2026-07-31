-- Migration 22 — staff_roles write access for signed-in staff.
--
-- CONDITIONAL: run this ONLY if, after deploying the Teacher Access fix,
-- saving a teacher login shows an error mentioning "row-level security",
-- "policy", or "permission denied". If the error says something else (for
-- example about the user_id format or a duplicate key), this file is not
-- the fix and running it won't help.
--
-- Teacher Access is admin-only in the UI, but the database also needs to
-- allow a signed-in staff member to write to staff_roles. If that policy
-- was never applied, every save silently failed — which, before this
-- round's fix, looked exactly like a successful save.
--
-- Safe to run whether or not these already exist.

alter table staff_roles enable row level security;

drop policy if exists "staff read staff_roles" on staff_roles;
create policy "staff read staff_roles" on staff_roles
  for select
  to authenticated
  using (true);

drop policy if exists "staff write staff_roles" on staff_roles;
create policy "staff write staff_roles" on staff_roles
  for all
  to authenticated
  using (true)
  with check (true);

-- Verify. Should list the two policies above.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'staff_roles'
order by policyname;
