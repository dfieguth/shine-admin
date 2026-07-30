-- Shine update 15: students default to Inactive, and automatically flip to
-- Active the moment a real enrollment (enrolled or waitlisted) is created
-- for them. Changing the actual column default (not just the app code) so
-- every insert path — manual add, registration processing, CSV import,
-- anything — gets this behavior consistently.
-- Run ONCE in the Supabase SQL Editor.

alter table students alter column season_status set default 'inactive';
