-- Shine update 14: general interest/contact list (people who aren't
-- enrolling a student but want updates when classes open).
-- Run ONCE in the Supabase SQL Editor.

create table if not exists contact_interest (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  message text,
  created_at timestamptz default now()
);
alter table contact_interest enable row level security;
do $$ begin
  create policy "staff full access contact interest" on contact_interest for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public can submit contact interest" on contact_interest for insert with check (true);
exception when duplicate_object then null; end $$;
