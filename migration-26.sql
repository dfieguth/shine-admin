-- Migration 26 — archive flag for families, powering both "hide old family
-- info" and "merge duplicate families."
--
-- Merging is built ON TOP of archiving, not as a separate destructive
-- action: merging two families moves every student from the record being
-- retired onto the survivor, then archives (does not delete) the retired
-- record. Archived families are hidden from the default Families view but
-- never actually gone — reversible with one click if a merge turns out to
-- be wrong, and still fully deletable later via the same bulk-delete
-- pattern already used on Students, once you're confident it's safe.
--
-- Safe to re-run.

alter table families add column if not exists archived boolean not null default false;
