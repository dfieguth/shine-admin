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
