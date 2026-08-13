-- Migration 27 — a third parent/guardian contact on families.
--
-- For situations like Lila Cisneros's — divorced parents plus a
-- grandmother who's also a primary caregiver, all three wanting to be kept
-- in the loop. Rather than a one-off field just for this family, this adds
-- it for everyone (optional, not required at registration), the same way
-- the existing "Secondary parent" fields already work.
--
-- Safe to re-run.

alter table families add column if not exists tertiary_parent_name text;
alter table families add column if not exists tertiary_parent_email text;
alter table families add column if not exists tertiary_parent_phone text;

-- The registrations log table already has secondary_parent_* columns
-- (added in an earlier round, before schema.sql was last consolidated) —
-- matching that same pattern for tertiary_parent_* so the raw registration
-- log stays consistent with what's actually being collected.
alter table registrations add column if not exists tertiary_parent_name text;
alter table registrations add column if not exists tertiary_parent_email text;
alter table registrations add column if not exists tertiary_parent_phone text;
