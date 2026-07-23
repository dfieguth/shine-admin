-- Shine update 13: student active/inactive status, more costume sizing
-- fields, and a real Volunteers roster (separate from raw inquiries).
-- Run ONCE in the Supabase SQL Editor.

-- ---- Students: active/inactive filtering ----
-- (season_status already existed from an earlier update but was never
-- surfaced in the UI — this update actually uses it.)

-- ---- Costume sizing: three more fields, everything existing stays ----
alter table students add column if not exists size_bust text;
alter table students add column if not exists size_hips text;
alter table students add column if not exists size_inseam text;

-- ---- Volunteers roster (separate from volunteer_inquiries) ----
-- volunteer_inquiries = raw public-site submissions (unchanged).
-- volunteers = the actual confirmed roster, once someone's been given
-- an assignment.
create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  roles text[] default '{}',   -- e.g. {"Studio Opener","Class Helper"}
  active boolean default true,
  notes text,
  created_at timestamptz default now()
);
alter table volunteers enable row level security;
do $$ begin
  create policy "staff full access volunteers roster" on volunteers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
