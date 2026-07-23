-- Shine update 12: per-teacher screen permissions (Corrie controls what
-- each teacher login can see, instead of one fixed "teacher" role).
-- Run ONCE in the Supabase SQL Editor.

alter table staff_roles add column if not exists allowed_screens text[] default '{attendance,my-classes}';
alter table staff_roles add column if not exists display_name text;
alter table staff_roles add column if not exists email text;
