-- Shine update 1: medical field, class capacity counts, waitlist support
-- Run this ONCE in the Supabase SQL Editor of your EXISTING project.
-- (Fresh installs don't need this; it's included in schema.sql.)

-- Medical / allergy info on students
alter table students add column if not exists medical_notes text;

-- Lets the public site see how many students are enrolled per class
-- (counts only — no student data is exposed)
create or replace function class_enrollment_counts()
returns table (class_id uuid, enrolled bigint)
language sql
security definer
set search_path = public
as $$
  select class_id, count(*)::bigint as enrolled
  from enrollments
  where status = 'enrolled'
  group by class_id;
$$;

grant execute on function class_enrollment_counts() to anon, authenticated;
