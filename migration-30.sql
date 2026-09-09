-- Migration 30 — new "TA" field on classes, alongside the existing
-- Class Helper (class_mom) and Greeter/Lobby Host (assistant_name)
-- fields, which were just relabeled in the UI (no column rename, only
-- the displayed text changed for those two).
--
-- Safe to re-run.

alter table classes add column if not exists ta_name text;
