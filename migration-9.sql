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
