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
