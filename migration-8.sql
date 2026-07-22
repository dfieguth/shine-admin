-- Shine update 8: richer registration form, student profile fields,
-- classes-per-student view, and parent-meeting/donation-intent tracking.
-- Run ONCE in the Supabase SQL Editor.

-- Student: birthday now captured (was only ever in a free-text notes field before)
alter table students add column if not exists birthday date;

-- Families: secondary parent + a proper emergency-contact relationship field
alter table families add column if not exists secondary_parent_name text;
alter table families add column if not exists secondary_parent_email text;
alter table families add column if not exists secondary_parent_phone text;
alter table families add column if not exists emergency_contact_relationship text;

-- Registrations: everything from Corrie's expanded registration form
alter table registrations add column if not exists student_birthday date;
alter table registrations add column if not exists secondary_parent_name text;
alter table registrations add column if not exists secondary_parent_email text;
alter table registrations add column if not exists secondary_parent_phone text;
alter table registrations add column if not exists emergency_contact_name text;
alter table registrations add column if not exists emergency_contact_relationship text;
alter table registrations add column if not exists emergency_contact_phone text;
alter table registrations add column if not exists meeting_aug28 boolean default false;
alter table registrations add column if not exists meeting_sep3 boolean default false;
alter table registrations add column if not exists meeting_acknowledged boolean default false;
alter table registrations add column if not exists wants_donation boolean default false;
