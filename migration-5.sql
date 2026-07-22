-- Shine update 5: seasons (yearly rollover)
-- Answers "we redo classes every year" — a season is copied forward instead
-- of being rebuilt by hand or re-imported from a spreadsheet each August.
-- Run ONCE in the Supabase SQL Editor.

alter table classes add column if not exists season text default '2025-2026';
alter table students add column if not exists season_status text default 'active'; -- active | inactive | new
