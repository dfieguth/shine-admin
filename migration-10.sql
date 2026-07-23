-- Shine update 10: new-vs-returning registration + confidence-scored student matching
-- Run ONCE in the Supabase SQL Editor.
alter table registrations add column if not exists is_returning boolean default false;
