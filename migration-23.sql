-- Migration 23 — record each student's registration date.
--
-- Adds `registered_at`, backfilled from the existing `created_at` column
-- for students already in the system (so historical students show a real
-- date, not the moment this migration ran). Going forward, this fills in
-- automatically via the column default — no app code changes needed on
-- either the public registration form or the admin "Add student" flow.
--
-- Safe to re-run.

alter table students add column if not exists registered_at timestamptz;

-- Backfill existing rows using created_at (their actual original insert
-- time), only where registered_at hasn't been set yet.
update students set registered_at = coalesce(created_at, now()) where registered_at is null;

alter table students alter column registered_at set default now();
