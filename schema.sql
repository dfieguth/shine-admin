-- Shine Dance Studio: database schema
-- This file is the source of truth for the database.
-- To set up a fresh Supabase project: open the SQL Editor, paste this whole file, run it.
-- Keep this file current. It is what makes handoff to another owner painless.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  parent_first_name text not null,
  parent_last_name text not null,
  email text,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  grade text,
  level text,
  family_id uuid references families(id) on delete cascade,
  medical_notes text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text,
  day_of_week text,
  start_time text,
  end_time text,
  location text,
  capacity integer,
  instructor_name text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  status text default 'enrolled', -- enrolled | waitlist | dropped
  enrolled_date date default current_date,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete cascade,
  class_date date not null,
  present boolean default false,
  created_at timestamptz default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  email text,
  phone text,
  student_name text not null,
  student_grade text,
  interested_class text,
  waiver_acknowledged boolean default false,
  processed boolean default false,
  submitted_date timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- Model:
--   - Staff (any logged-in user) can read and write everything.
--   - The public (anon) can ONLY insert into registrations. Nothing else.
-- This lets the public site submit a registration without exposing the roster.

alter table families enable row level security;
alter table students enable row level security;
alter table classes enable row level security;
alter table enrollments enable row level security;
alter table attendance enable row level security;
alter table registrations enable row level security;

-- Staff: full access to everything when authenticated.
create policy "staff full access families"    on families    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access students"    on students    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access classes"     on classes     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access enrollments" on enrollments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access attendance"  on attendance  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "staff full access registrations" on registrations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Public site: anyone can view active classes (for the live schedule).
create policy "public can view active classes" on classes for select using (active = true);

-- Public site: anyone can submit a registration, but cannot read them back.
create policy "public can submit registration" on registrations for insert with check (true);

-- ============================================================
-- TEACHERS (added: staff roster, so instructors aren't just text)
-- ============================================================
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  specialties text, -- e.g. "Ballet, Tap"
  notes text,
  created_at timestamptz default now()
);
alter table teachers enable row level security;
create policy "staff full access teachers" on teachers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- ANNOUNCEMENTS (breaks, closures, news — shown on public site)
-- ============================================================
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  starts_on date,
  ends_on date,
  active boolean default true,
  created_at timestamptz default now()
);
alter table announcements enable row level security;
create policy "staff full access announcements" on announcements for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "public can view active announcements" on announcements for select using (active = true);

-- ============================================================
-- SITE PHOTOS (Supabase Storage bucket the public site reads)
-- Hero photo lives at 'hero.jpg'; gallery photos under 'gallery/'
-- ============================================================
insert into storage.buckets (id, name, public) values ('site-photos', 'site-photos', true)
on conflict (id) do nothing;
create policy "public read site photos" on storage.objects for select using (bucket_id = 'site-photos');
create policy "staff insert site photos" on storage.objects for insert with check (bucket_id = 'site-photos' and auth.role() = 'authenticated');
create policy "staff update site photos" on storage.objects for update using (bucket_id = 'site-photos' and auth.role() = 'authenticated');
create policy "staff delete site photos" on storage.objects for delete using (bucket_id = 'site-photos' and auth.role() = 'authenticated');

-- ============================================================
-- CLASS ENROLLMENT COUNTS (public-safe: counts only)
-- Lets the public site mark full classes without exposing data
-- ============================================================
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
-- Shine update 2: admin-managed team bios and parent testimonials
-- Run ONCE in the Supabase SQL Editor of your existing project.

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  bio text,
  photo_path text,
  sort_order integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);
alter table team_members enable row level security;
create policy "staff full access team" on team_members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "public view active team" on team_members for select using (active = true);

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  attribution text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table testimonials enable row level security;
create policy "staff full access testimonials" on testimonials for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "public view active testimonials" on testimonials for select using (active = true);
-- Shine update 3: three-state attendance (Present / Tardy / Absent)
-- matching the paper sign-in sheets. Run ONCE in the SQL Editor.
alter table attendance add column if not exists status text;

-- Student photos: PRIVATE bucket (children's photos, staff-only access)
alter table students add column if not exists photo_path text;
insert into storage.buckets (id, name, public) values ('student-photos', 'student-photos', false)
on conflict (id) do nothing;
create policy "staff read student photos" on storage.objects for select using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff insert student photos" on storage.objects for insert with check (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff update student photos" on storage.objects for update using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
create policy "staff delete student photos" on storage.objects for delete using (bucket_id = 'student-photos' and auth.role() = 'authenticated');
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
-- Shine update 5: seasons (yearly rollover)
-- Answers "we redo classes every year" — a season is copied forward instead
-- of being rebuilt by hand or re-imported from a spreadsheet each August.
-- Run ONCE in the Supabase SQL Editor.

alter table classes add column if not exists season text default '2025-2026';
alter table students add column if not exists season_status text default 'active'; -- active | inactive | new
-- Shine update 6: rooms, class room/teacher assignment, sorting & grouped email
-- Run ONCE in the Supabase SQL Editor.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  capacity integer,
  created_at timestamptz default now()
);
alter table rooms enable row level security;
do $$ begin
  create policy "staff full access rooms" on rooms for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public view rooms" on rooms for select using (true);
exception when duplicate_object then null; end $$;

-- classes gain a room reference (teacher already exists as instructor_name;
-- we also add teacher_id to link to the teachers table for reliable grouping)
alter table classes add column if not exists room_id uuid references rooms(id) on delete set null;
alter table classes add column if not exists teacher_id uuid references teachers(id) on delete set null;

-- seed the three real rooms from Corrie's DSP screenshot
insert into rooms (name) values ('B21'), ('C25'), ('Small Room (B21)')
on conflict do nothing;
-- Shine update 7: volunteer inquiries (replaces the mailto volunteer button)
-- Run ONCE in the Supabase SQL Editor.

create table if not exists volunteer_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  message text,
  processed boolean default false,
  submitted_date timestamptz default now()
);
alter table volunteer_inquiries enable row level security;
do $$ begin
  create policy "staff full access volunteers" on volunteer_inquiries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public can submit volunteer" on volunteer_inquiries for insert with check (true);
exception when duplicate_object then null; end $$;
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
-- Shine update 9: teacher role access, class mom/assistant, costume sizing, recital flag
-- Run ONCE in the Supabase SQL Editor.

-- ============================================================
-- 1. CLASS MOM + ASSISTANT + RECITAL FLAG
-- ============================================================
alter table classes add column if not exists class_mom text;
alter table classes add column if not exists assistant_name text;
alter table classes add column if not exists in_recital boolean default false;

-- ============================================================
-- 2. COSTUME / T-SHIRT SIZING (per student)
-- ============================================================
alter table students add column if not exists size_tshirt text;
alter table students add column if not exists size_leotard text;
alter table students add column if not exists size_dress text;
alter table students add column if not exists size_shoe text;
alter table students add column if not exists size_girth text;
alter table students add column if not exists size_height text;
alter table students add column if not exists size_waist text;
alter table students add column if not exists size_notes text;
alter table students add column if not exists size_measured_on date;

-- ============================================================
-- 3. TEACHER ROLE — limited access for attendance only
-- ============================================================
-- A staff_roles table maps a logged-in auth user to a role.
-- Anyone NOT listed here who can log in is treated as full staff (admin),
-- which preserves existing behavior for Corrie and current logins.
create table if not exists staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'teacher',   -- 'admin' | 'teacher'
  teacher_id uuid references teachers(id) on delete set null,
  created_at timestamptz default now()
);
alter table staff_roles enable row level security;
do $$ begin
  create policy "staff read roles" on staff_roles for select using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admins manage roles" on staff_roles for all
    using (not exists (select 1 from staff_roles sr where sr.user_id = auth.uid() and sr.role = 'teacher'))
    with check (not exists (select 1 from staff_roles sr where sr.user_id = auth.uid() and sr.role = 'teacher'));
exception when duplicate_object then null; end $$;

-- Helper: is the current user a limited teacher?
create or replace function is_teacher_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_roles where user_id = auth.uid() and role = 'teacher');
$$;
grant execute on function is_teacher_role() to authenticated;

-- ============================================================
-- 4. LOCK DOWN SENSITIVE TABLES FROM TEACHERS
-- Teachers may read classes/students/enrollments and write attendance.
-- They may NOT read families (parent contacts) or registrations.
-- ============================================================
drop policy if exists "staff full access families" on families;
create policy "admins only families" on families for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff full access registrations" on registrations;
create policy "admins only registrations" on registrations for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

drop policy if exists "staff full access volunteers" on volunteer_inquiries;
create policy "admins only volunteers" on volunteer_inquiries for all
  using (auth.role() = 'authenticated' and not is_teacher_role())
  with check (auth.role() = 'authenticated' and not is_teacher_role());

-- Students: teachers can READ (needed for rosters) but not modify.
drop policy if exists "staff full access students" on students;
create policy "staff read students" on students for select using (auth.role() = 'authenticated');
create policy "admins write students" on students for insert with check (auth.role() = 'authenticated' and not is_teacher_role());
create policy "admins update students" on students for update using (auth.role() = 'authenticated' and not is_teacher_role());
create policy "admins delete students" on students for delete using (auth.role() = 'authenticated' and not is_teacher_role());
