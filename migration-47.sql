-- Migration 47 — slideshow timing (seconds each photo shows, seconds of fade).
--
-- Safe to run on the live database at any time, and safe to re-run.
-- It only ADDS one small table with one row. Until the new code is pushed
-- nothing reads it. If it is missing, the site keeps 4.5s / 1.8s.

create table if not exists gallery_settings (
  id           integer primary key check (id = 1),
  show_seconds numeric(3,1) not null default 4.5 check (show_seconds between 3 and 6),
  fade_seconds numeric(3,2) not null default 1.8 check (fade_seconds between 0.5 and 2),
  updated_at   timestamptz not null default now()
);

insert into gallery_settings (id) values (1) on conflict (id) do nothing;

alter table gallery_settings enable row level security;

drop policy if exists "public read gallery settings" on gallery_settings;
create policy "public read gallery settings" on gallery_settings for select using (true);

drop policy if exists "staff manage gallery settings" on gallery_settings;
create policy "staff manage gallery settings" on gallery_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

grant select on gallery_settings to anon;
grant select, insert, update on gallery_settings to authenticated;

-- Check: should return one row: 4.5 and 1.80
select show_seconds, fade_seconds from gallery_settings;
