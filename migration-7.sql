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
