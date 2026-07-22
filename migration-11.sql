-- Shine update 11: separate age field on registrations (grade and age were combined before)
-- Run ONCE in the Supabase SQL Editor.
alter table registrations add column if not exists student_age text;
