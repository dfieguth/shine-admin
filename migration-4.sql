-- Shine update 4: age range on classes + per-field privacy settings
-- Reverse-engineered from Corrie's real Dance Studio Pro screenshots.
-- Run ONCE in the Supabase SQL Editor.

alter table classes add column if not exists min_age integer;
alter table classes add column if not exists max_age integer;

-- Studio-wide privacy toggles, matching DSP's "Roll Sheet Settings" panel.
-- Single row table (one settings record for the whole studio).
create table if not exists privacy_settings (
  id integer primary key default 1,
  hide_student_pictures boolean default true,
  hide_parent_phone boolean default false,
  show_emergency_contact boolean default true,
  show_medical_info boolean default false,
  hide_student_ages boolean default false,
  show_teacher_names boolean default true,
  constraint single_row check (id = 1)
);
insert into privacy_settings (id) values (1) on conflict (id) do nothing;
alter table privacy_settings enable row level security;
create policy "staff full access privacy" on privacy_settings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
