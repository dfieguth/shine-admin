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
